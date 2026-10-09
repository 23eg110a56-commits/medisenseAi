"""Public capability endpoint.

The UI must be able to tell the user when a feature is running in a degraded
mode (no language model, no OCR engine, no vector index) instead of presenting
offline output as though a model produced it. No secrets or patient data are
exposed here.
"""

from fastapi import APIRouter

from app.config import settings
from app.database.connection import db as db_state
from app.services.gemini_service import gemini_client
from app.services.ocr_service import ocr_engine_status
from app.services.rag_service import rag_engine

router = APIRouter()


@router.get("/status")
async def system_status():
    engines = ocr_engine_status()
    rag = rag_engine.status()
    return {
        "llm": gemini_client.status(),
        "ocr": {
            **engines,
            "any_engine_available": bool(
                engines["easyocr"] or engines["tesseract"] or engines["pdf_text_layer"]
            ),
        },
        "rag": rag,
        "storage": {"mode": "embedded_json" if db_state.is_embedded else "mongodb"},
        "limits": {
            "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
            "allowed_extensions": sorted({"pdf", "png", "jpg", "jpeg"}),
        },
        "dev_otp_exposed": settings.EXPOSE_DEV_OTP,
    }
