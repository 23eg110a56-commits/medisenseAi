"""Text extraction from PDFs and images.

Extraction is best-effort and always reports which engine produced the text, so
the UI can tell the user whether a result came from a real text layer, local
OCR, or a vision model — or whether no engine was available at all.
"""

import io
import logging
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

try:
    import pdfplumber
    import pymupdf
    HAS_PDF_LIBS = True
except ImportError as exc:  # pragma: no cover
    logger.warning("PDF libraries not available: %s", exc)
    HAS_PDF_LIBS = False

try:
    import cv2
    HAS_OPENCV = True
except ImportError:  # pragma: no cover
    logger.warning("OpenCV not available; image preprocessing will be skipped.")
    HAS_OPENCV = False

try:
    import easyocr
    HAS_EASYOCR = True
except ImportError:  # pragma: no cover
    HAS_EASYOCR = False
    logger.info("EasyOCR not installed; falling back to Tesseract for image OCR.")

try:
    import pytesseract
    HAS_TESSERACT_MODULE = True
except ImportError:  # pragma: no cover
    HAS_TESSERACT_MODULE = False

_easyocr_reader = None
_easyocr_failed = False
TESSERACT_BINARY_OK: Optional[bool] = None

IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def ocr_engine_status() -> Dict[str, Any]:
    """Availability of each extraction engine, for the /system/status endpoint."""
    global TESSERACT_BINARY_OK
    if HAS_TESSERACT_MODULE and TESSERACT_BINARY_OK is None:
        try:
            pytesseract.get_tesseract_version()
            TESSERACT_BINARY_OK = True
        except Exception:
            TESSERACT_BINARY_OK = False

    return {
        "pdf_text_layer": HAS_PDF_LIBS,
        "image_preprocessing": HAS_OPENCV,
        "easyocr": HAS_EASYOCR,
        "tesseract": bool(HAS_TESSERACT_MODULE and TESSERACT_BINARY_OK),
        "tesseract_module_only": bool(HAS_TESSERACT_MODULE and TESSERACT_BINARY_OK is False),
    }


def preprocess_image(image_bytes: bytes) -> Image.Image:
    """Denoise and upscale an image to improve OCR accuracy."""
    if not HAS_OPENCV:
        return Image.open(io.BytesIO(image_bytes))
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("OpenCV could not decode the image")
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.fastNlMeansDenoising(gray, h=10)
        height, width = gray.shape
        if width < 1000:
            gray = cv2.resize(gray, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
        _, encoded = cv2.imencode(".png", gray)
        return Image.open(io.BytesIO(encoded.tobytes()))
    except Exception as exc:
        logger.error("Image preprocessing failed: %s. Using the original image.", exc)
        return Image.open(io.BytesIO(image_bytes))


def extract_text_from_pdf(pdf_bytes: bytes) -> Tuple[str, int]:
    """Extract embedded text from a digital PDF. Returns (text, page_count)."""
    if not HAS_PDF_LIBS:
        return "", 0
    text = ""
    page_count = 0
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as exc:
        logger.warning("pdfplumber extraction failed: %s", exc)

    if not text.strip():
        try:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
            page_count = len(doc)
            for page in doc:
                text += page.get_text() + "\n"
            doc.close()
        except Exception as exc:
            logger.error("PyMuPDF extraction failed: %s", exc)
    return text.strip(), page_count


def run_local_ocr_on_image(pil_img: Image.Image) -> Tuple[str, Optional[str]]:
    """Run OCR with EasyOCR then Tesseract. Returns (text, engine_name_or_None)."""
    global _easyocr_reader, _easyocr_failed, TESSERACT_BINARY_OK

    if HAS_EASYOCR and not _easyocr_failed:
        try:
            if _easyocr_reader is None:
                logger.info("Initialising EasyOCR reader (first run downloads models)...")
                _easyocr_reader = easyocr.Reader(["en"], verbose=False)
            results = _easyocr_reader.readtext(np.array(pil_img))
            text = "\n".join(res[1] for res in results)
            if text.strip():
                return text, "easyocr"
        except Exception as exc:
            _easyocr_failed = True
            logger.error("EasyOCR failed and will not be retried this session: %s", exc)

    if HAS_TESSERACT_MODULE:
        try:
            text = pytesseract.image_to_string(pil_img)
            TESSERACT_BINARY_OK = True
            if text.strip():
                return text, "tesseract"
        except Exception as exc:
            TESSERACT_BINARY_OK = False
            logger.warning("Tesseract OCR unavailable: %s", exc)

    return "", None


async def _vision_ocr(file_bytes: bytes, gemini_client, warnings: List[str]) -> str:
    if not gemini_client or not getattr(gemini_client, "is_configured", False):
        return ""
    prompt = (
        "Transcribe every line of this medical report exactly as printed, preserving the "
        "table structure: test name, observed value, unit, biological reference interval and "
        "status flag. Do not summarise, interpret, or add any value that is not visible."
    )
    try:
        text = await gemini_client.analyze_multimodal(prompt, file_bytes, "image/png")
        if text.strip():
            return text
    except Exception as exc:
        logger.error("Vision OCR fallback failed: %s", exc)
    warnings.append("The vision-model OCR fallback did not return text.")
    return ""


async def extract_text_pipeline(
    file_bytes: bytes,
    filename: str,
    gemini_client=None,
) -> Dict[str, Any]:
    """Extract text from an uploaded report.

    Returns a dict with keys: ``text``, ``engine``, ``page_count``, ``warnings``.
    ``text`` is empty when nothing could be extracted — callers must not
    substitute placeholder content for it.
    """
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    warnings: List[str] = []
    text = ""
    engine: Optional[str] = None
    page_count = 0

    if ext == "pdf":
        if not HAS_PDF_LIBS:
            warnings.append("PDF libraries are not installed on this server; PDF files cannot be read.")
            return {"text": "", "engine": None, "page_count": 0, "warnings": warnings}

        text, page_count = extract_text_from_pdf(file_bytes)
        if text.strip():
            engine = "pdf_text_layer"
        else:
            try:
                doc = pymupdf.open(stream=file_bytes, filetype="pdf")
                page_count = len(doc)
                page_texts: List[str] = []
                for i in range(page_count):
                    pix = doc[i].get_pixmap(dpi=200)
                    img_data = pix.tobytes("png")
                    page_text, page_engine = run_local_ocr_on_image(preprocess_image(img_data))
                    if not page_text.strip():
                        page_text = await _vision_ocr(img_data, gemini_client, warnings)
                        page_engine = "vision_model" if page_text.strip() else None
                    if page_engine and engine is None:
                        engine = page_engine
                    page_texts.append(page_text)
                doc.close()
                text = "\n".join(p for p in page_texts if p.strip()).strip()
            except Exception as exc:
                logger.error("Scanned-PDF rendering/OCR failed: %s", exc)
                warnings.append(f"Scanned-page OCR failed: {exc}")

        if not text.strip():
            warnings.append(
                "No text could be extracted from this PDF. It may be a scan with no usable image "
                "OCR engine available on this server."
            )

    elif ext in IMAGE_EXTENSIONS:
        try:
            pil_img = preprocess_image(file_bytes)
            text, engine = run_local_ocr_on_image(pil_img)
        except Exception as exc:
            logger.error("Image OCR failed: %s", exc)
            warnings.append(f"Image could not be processed: {exc}")

        if not text.strip():
            text = await _vision_ocr(file_bytes, gemini_client, warnings)
            engine = "vision_model" if text.strip() else None

        if not text.strip():
            status = ocr_engine_status()
            if not status["easyocr"] and not status["tesseract"]:
                warnings.append(
                    "No OCR engine is available on this server (install EasyOCR or the Tesseract "
                    "binary), and no vision model is configured. Image text could not be extracted."
                )
            else:
                warnings.append(
                    "OCR ran but found no readable text. Try a higher-resolution scan, or correct "
                    "the extracted text manually."
                )
    elif ext in ("txt", "text", "csv", "log"):
        try:
            text = file_bytes.decode("utf-8", errors="replace").strip()
            engine = "direct_text"
            page_count = 1
        except Exception as exc:
            logger.error("Text file reading failed: %s", exc)
            warnings.append(f"Text file reading failed: {exc}")
    else:
        warnings.append(f"Unsupported file type '.{ext}'.")

    return {
        "text": text,
        "engine": engine,
        "page_count": page_count,
        "warnings": warnings,
    }
