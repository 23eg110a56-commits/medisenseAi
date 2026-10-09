import io
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from bson import ObjectId
from pydantic import BaseModel, Field
from app.config import settings
from app.database.connection import get_db, get_fs
from app.auth.jwt import get_current_user
from app.services.ocr_service import extract_text_pipeline
from app.services.gemini_service import gemini_client
from app.services.export_service import generate_report_pdf, generate_report_docx

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/octet-stream",  # browsers sometimes send this for PDFs
}
MAX_FILE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def _extension(filename: Optional[str]) -> str:
    return (filename or "").lower().rsplit(".", 1)[-1] if filename and "." in filename else ""


def validate_upload(filename: Optional[str], content_type: Optional[str], size: int) -> None:
    """Reject unsupported or oversized files with an actionable message."""
    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"'{filename}' is not a supported file type. Upload PDF, PNG, JPG or JPEG.",
        )
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"'{filename}' was sent as '{content_type}', which does not match a report file.",
        )
    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{filename}' is empty.",
        )
    if size > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=(
                f"'{filename}' is {size / 1024 / 1024:.1f} MB, which exceeds the "
                f"{settings.MAX_UPLOAD_SIZE_MB} MB limit."
            ),
        )


# Helper to serialize MongoDB ObjectIds
def serialize_doc(doc):
    if not doc:
        return None
    doc["id"] = str(doc["_id"])
    del doc["_id"]
    return doc


def _format_date(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%b %d, %Y")
    text = str(value or "")
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).strftime("%b %d, %Y")
    except ValueError:
        return text[:10]


def _sortable_date(value):
    """Normalise stored dates so Mongo datetimes and JSON strings compare safely."""
    if isinstance(value, datetime):
        return value.timestamp()
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return 0.0


def _normalise_name(name: str) -> str:
    cleaned = re.sub(r"\(.*?\)", " ", name or "")
    cleaned = re.sub(r"[^a-z0-9 ]", " ", cleaned.lower())
    return " ".join(cleaned.split())


def _normalise_unit(unit: str) -> str:
    return (unit or "").strip().lower().replace(" ", "")


def _to_number(value: str):
    try:
        return float(str(value).replace(",", "").strip().split()[0])
    except (ValueError, IndexError):
        return None


def _is_toward_normal(row: dict) -> bool:
    return row.get("new_status") == "Normal" and row.get("old_status") in ("High", "Low", "Critical")


def _is_away_from_normal(row: dict) -> bool:
    return row.get("old_status") == "Normal" and row.get("new_status") in ("High", "Low", "Critical")


@router.post("/upload")
async def upload_reports(
    files: List[UploadFile] = File(...),
    language: str = Form("en"),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
    fs=Depends(get_fs)
):
    """Store the file and extract its text. Analysis happens after the user has
    had a chance to review and correct the extracted text."""
    if db is None or fs is None:
        raise HTTPException(status_code=500, detail="Database/GridFS not connected")

    uploaded_reports = []
    errors = []

    for file in files:
        filename = file.filename
        try:
            # Read one byte past the limit so oversized files are rejected
            # without buffering an unbounded upload into memory.
            file_bytes = await file.read(MAX_FILE_BYTES + 1)
            validate_upload(filename, file.content_type, len(file_bytes))

            grid_in = fs.open_upload_stream(
                filename,
                metadata={"user_id": current_user["id"], "content_type": file.content_type}
            )
            await grid_in.write(file_bytes)
            await grid_in.close()
            gridfs_id = str(grid_in._id)

            extraction = await extract_text_pipeline(file_bytes, filename, gemini_client)
            extracted_text = extraction["text"]

            report_doc = {
                "user_id": current_user["id"],
                "patient_name": current_user.get("name", ""),
                "filename": filename,
                "gridfs_id": gridfs_id,
                "file_size": len(file_bytes),
                "extracted_text": extracted_text,
                "extraction_engine": extraction["engine"],
                "page_count": extraction["page_count"],
                "extraction_warnings": extraction["warnings"],
                "analysis_status": "awaiting_review" if extracted_text.strip() else "extraction_failed",
                "analysis_mode": None,
                "report_type": "Pending text review",
                "summary": "",
                "biomarkers": [],
                "health_concerns": {},
                "recommendations": {},
                "health_score": None,
                "warnings": [],
                "unparsed_lines": [],
                "requires_manual_review": True,
                "language": language,
                "created_at": datetime.now(timezone.utc),
            }

            result = await db.reports.insert_one(report_doc)
            report_doc["id"] = str(result.inserted_id)
            report_doc.pop("_id", None)
            uploaded_reports.append(report_doc)

        except HTTPException as exc:
            # Per-file validation problems must not discard the rest of the batch.
            errors.append({
                "filename": filename,
                "detail": exc.detail,
                "status_code": exc.status_code,
            })
            logger.warning("Rejected upload '%s': %s", filename, exc.detail)
        except Exception as exc:
            logger.exception("Error processing file %s", filename)
            errors.append({
                "filename": filename,
                "detail": f"Could not process '{filename}': {exc}",
                "status_code": 400,
            })

    if not uploaded_reports:
        if len(errors) == 1:
            raise HTTPException(
                status_code=errors[0]["status_code"], detail=errors[0]["detail"]
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={
            "message": "No files could be processed.",
            "errors": [{"filename": e["filename"], "detail": e["detail"]} for e in errors],
        })

    return {
        "reports": uploaded_reports,
        "errors": [{"filename": e["filename"], "detail": e["detail"]} for e in errors],
    }


class TextUpdate(BaseModel):
    extracted_text: str = Field(..., description="Corrected OCR text supplied by the user")


@router.put("/{report_id}/text")
async def update_extracted_text(
    report_id: str,
    payload: TextUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Save a user's OCR corrections without re-running analysis."""
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    report = await find_report_by_id(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    text = payload.extracted_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Extracted text cannot be empty.")
    if len(text) > 200_000:
        raise HTTPException(status_code=413, detail="Extracted text is too large to store.")

    await db.reports.update_one(
        {"_id": report["_id"]},
        {"$set": {
            "extracted_text": text,
            "text_corrected_by_user": True,
            "analysis_status": "awaiting_review",
            "extraction_warnings": [
                w for w in report.get("extraction_warnings", [])
                if "No text could be extracted" not in w
            ],
        }},
    )
    updated = await find_report_by_id(db, report_id, current_user["id"])
    return serialize_doc(updated)


class AnalyzeRequest(BaseModel):
    extracted_text: Optional[str] = Field(
        None, description="Optional corrected text to analyse instead of the stored text"
    )
    language: Optional[str] = None


@router.post("/{report_id}/analyze")
async def analyze_report(
    report_id: str,
    payload: AnalyzeRequest = AnalyzeRequest(),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Run analysis over the extracted (and optionally corrected) text."""
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    report = await find_report_by_id(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    text = (payload.extracted_text or report.get("extracted_text") or "").strip()
    if not text:
        raise HTTPException(
            status_code=422,
            detail=(
                "There is no extracted text to analyse. Correct the extracted text first, "
                "or re-upload a readable copy of the report."
            ),
        )

    language = payload.language or report.get("language", "en")
    try:
        analysis = await gemini_client.analyze_medical_report(text, language=language)
    except Exception as exc:
        logger.exception("Analysis failed for report %s", report_id)
        raise HTTPException(status_code=502, detail=f"Analysis failed: {exc}")

    update = {
        "extracted_text": text,
        "language": language,
        "analysis_status": "analyzed",
        "analysis_mode": analysis.get("analysis_mode"),
        "llm_notice": analysis.get("llm_notice"),
        "report_type": analysis.get("report_type", "Unclassified laboratory report"),
        "summary": analysis.get("summary", ""),
        "biomarkers": analysis.get("biomarkers", []),
        "health_concerns": analysis.get("health_concerns", {}),
        "recommendations": analysis.get("recommendations", {}),
        "health_score": analysis.get("health_score"),
        "health_score_basis": analysis.get("health_score_basis"),
        "warnings": analysis.get("warnings", []),
        "unparsed_lines": analysis.get("unparsed_lines", []),
        "requires_manual_review": analysis.get("requires_manual_review", True),
        "grounding": analysis.get("grounding"),
        "analyzed_at": datetime.now(timezone.utc),
    }
    if payload.extracted_text:
        update["text_corrected_by_user"] = True

    await db.reports.update_one({"_id": report["_id"]}, {"$set": update})

    await db.notifications.insert_one({
        "user_id": current_user["id"],
        "title": "Report analysis complete",
        "message": f"Analysis of '{report.get('filename')}' is ready to review.",
        "type": "success",
        "read": False,
        "created_at": datetime.now(timezone.utc),
    })

    updated = await find_report_by_id(db, report_id, current_user["id"])
    return serialize_doc(updated)


@router.get("/all")
async def get_user_reports(current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    cursor = db.reports.find({"user_id": current_user["id"]}).sort("created_at", -1)
    reports = []
    async for doc in cursor:
        serialized = serialize_doc(doc)
        # The listing view does not need the raw document text; keeping it out of
        # bulk responses limits how widely sensitive content is transmitted.
        text = serialized.pop("extracted_text", "") or ""
        serialized["has_extracted_text"] = bool(text.strip())
        serialized["extracted_text_chars"] = len(text)
        reports.append(serialized)
    return reports

async def find_report_by_id(db, report_id: str, user_id: str = None):
    query = {"_id": str(report_id)}
    if user_id:
        query["user_id"] = str(user_id)
    doc = await db.reports.find_one(query)
    if not doc:
        try:
            query["_id"] = ObjectId(report_id)
            doc = await db.reports.find_one(query)
        except Exception:
            pass
    return doc

@router.get("/detail/{report_id}")
async def get_report_detail(report_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
         raise HTTPException(status_code=500, detail="Database not connected")
         
    report = await find_report_by_id(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    return serialize_doc(report)

@router.delete("/delete/{report_id}")
async def delete_report(report_id: str, current_user=Depends(get_current_user), db=Depends(get_db), fs=Depends(get_fs)):
    if db is None or fs is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    report = await find_report_by_id(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    # Delete from GridFS
    try:
        gridfs_id = report.get("gridfs_id")
        if gridfs_id:
            await fs.delete(ObjectId(gridfs_id))
    except Exception as e:
        logger.error(f"Error deleting file from GridFS: {e}")

    # Cascade: chat transcripts and public share links derived from this report
    # are part of the same sensitive record and must not outlive it.
    for collection, field in ((db.chats, "report_id"), (db.shared_links, "report_id")):
        try:
            await collection.delete_many({field: report_id})
        except Exception as e:
            logger.error("Error deleting related records for report %s: %s", report_id, e)

    # Delete from reports collection
    try:
        await db.reports.delete_one({"_id": report["_id"]})
    except Exception:
        await db.reports.delete_one({"_id": str(report_id)})
    return {"message": "Report deleted successfully"}

@router.get("/compare")
async def compare_reports(
    report_id1: str,
    report_id2: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    r1 = await find_report_by_id(db, report_id1, current_user["id"])
    r2 = await find_report_by_id(db, report_id2, current_user["id"])
    if not r1 or not r2:
        raise HTTPException(status_code=404, detail="One or both reports not found")

    pending = [r.get("filename") for r in (r1, r2) if r.get("analysis_status") != "analyzed" and not r.get("biomarkers")]
    if pending:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Not analysed yet: {', '.join(str(p) for p in pending)}. Review the extracted "
                "text and run the analysis before comparing."
            ),
        )
        
    # Order reports by date so old_report is the earlier one
    if _sortable_date(r1.get("created_at")) > _sortable_date(r2.get("created_at")):
        old_report, new_report = r2, r1
    else:
        old_report, new_report = r1, r2
        
    # Match results by normalised test name, and only compute deltas where the
    # units agree — comparing across different units would be meaningless.
    comparisons = []
    old_biomarkers = {_normalise_name(bm.get("name", "")): bm for bm in old_report.get("biomarkers", [])}

    for new_bm in new_report.get("biomarkers", []):
        name = new_bm.get("name", "")
        key = _normalise_name(name)

        old_val_str = "Not in earlier report"
        diff_str = "N/A"
        pct_change = 0.0
        direction = "no change"
        old_status = None
        reason = ""

        old_bm = old_biomarkers.get(key)
        if old_bm is None:
            reason = "This test does not appear in the earlier report."
        else:
            old_val_str = str(old_bm.get("value", ""))
            old_status = old_bm.get("status")
            old_unit = _normalise_unit(old_bm.get("unit", ""))
            new_unit = _normalise_unit(new_bm.get("unit", ""))

            if old_unit and new_unit and old_unit != new_unit:
                reason = f"Units differ between reports ({old_bm.get('unit')} vs {new_bm.get('unit')}); values are not comparable."
            else:
                v1 = _to_number(old_val_str)
                v2 = _to_number(new_bm.get("value", ""))
                if v1 is None or v2 is None:
                    reason = "One or both values are non-numeric, so no delta can be calculated."
                    if old_val_str != new_bm.get("value"):
                        direction = "changed"
                        diff_str = "Changed"
                else:
                    diff = v2 - v1
                    diff_str = f"{diff:+.2f}"
                    pct_change = (diff / v1 * 100) if v1 else 0.0
                    if abs(diff) < 1e-9:
                        direction = "unchanged"
                    elif diff > 0:
                        direction = "increased"
                    else:
                        direction = "decreased"

        comparisons.append({
            "name": name,
            "unit": new_bm.get("unit", ""),
            "old_value": old_val_str,
            "new_value": new_bm.get("value", ""),
            "old_status": old_status,
            "new_status": new_bm.get("status", "Review"),
            "reference_range": new_bm.get("reference_range", ""),
            "difference": diff_str,
            "percentage_change": f"{pct_change:+.1f}%" if diff_str not in ("N/A", "Changed") else diff_str,
            "direction": direction,
            "status": new_bm.get("status", "Review"),
            "comparable": diff_str not in ("N/A", "Changed"),
            "reason": reason,
        })

    # Generate high-level improvement score and narrative
    health_delta = (new_report.get("health_score") or 0) - (old_report.get("health_score") or 0)
    scores_available = new_report.get("health_score") is not None and old_report.get("health_score") is not None

    date_str_old = _format_date(old_report.get("created_at"))
    date_str_new = _format_date(new_report.get("created_at"))

    comparable = [c for c in comparisons if c["comparable"]]
    incomparable = [c["name"] for c in comparisons if not c["comparable"]]
    improved = [c["name"] for c in comparable if _is_toward_normal(c)]
    worsened = [c["name"] for c in comparable if _is_away_from_normal(c)]
    still_abnormal = [c["name"] for c in comparisons if c.get("status") in ("High", "Low", "Critical")]

    narrative_parts = [
        f"Comparison between the report from {date_str_old} and the report from {date_str_new}.",
    ]
    if scores_available:
        narrative_parts.append(
            f"The parsed-result score moved from {old_report.get('health_score')} to "
            f"{new_report.get('health_score')} ({health_delta:+.0f}). This is an application "
            "heuristic, not a clinical assessment."
        )
    else:
        narrative_parts.append(
            "No score comparison is available because at least one of these reports has no "
            "parsed results."
        )
    if comparable:
        narrative_parts.append(
            f"{len(comparable)} of {len(comparisons)} result(s) could be compared numerically "
            "because the same test, unit and printed range appeared in both reports."
        )
    else:
        narrative_parts.append(
            "No result could be compared numerically: the two reports do not share tests with "
            "matching values and units."
        )
    if improved:
        narrative_parts.append(f"Moved back inside the printed range: {', '.join(improved[:5])}.")
    if worsened:
        narrative_parts.append(f"Moved further outside the printed range: {', '.join(worsened[:5])}.")
    if still_abnormal:
        narrative_parts.append(
            f"Still outside the printed reference range in the newer report: {', '.join(still_abnormal[:5])}. "
            "Discuss these with your healthcare provider."
        )
    if incomparable:
        narrative_parts.append(
            f"Could not be compared (missing in one report, or non-numeric): {', '.join(incomparable[:5])}."
        )
    narrative_parts.append(
        "\n\n*This comparison is educational only. Trends must be interpreted by a clinician "
        "who knows the laboratory method and your history.*"
    )
    narrative = " ".join(narrative_parts)

    # An LLM-generated narrative is only attempted when a model is actually configured.
    narrative_source = "computed"
    if gemini_client.is_configured:
        try:
            llm_narrative = await gemini_client.chat_assistant(
                user_message=(
                    "Summarise the changes between these two reports of the same patient, noting "
                    "improvements, deteriorations and which results remain outside their printed "
                    "ranges. Do not diagnose."
                ),
                report_text=(
                    f"Older report ({date_str_old}, {old_report.get('report_type')}): "
                    f"{old_report.get('summary')}\n"
                    f"Newer report ({date_str_new}, {new_report.get('report_type')}): "
                    f"{new_report.get('summary')}"
                ),
                chat_history=[],
                retrieved_context=json.dumps(comparisons),
                language=new_report.get("language", "en"),
            )
            if llm_narrative and llm_narrative.strip():
                narrative = llm_narrative
                narrative_source = "llm"
        except Exception as exc:
            logger.error("LLM comparison narrative failed: %s. Keeping the computed narrative.", exc)

    return {
        "old_report_id": str(old_report.get("_id") or old_report.get("id") or ""),
        "new_report_id": str(new_report.get("_id") or new_report.get("id") or ""),
        "old_report_date": _format_date(old_report.get("created_at")),
        "new_report_date": _format_date(new_report.get("created_at")),
        "old_report_type": old_report.get("report_type"),
        "new_report_type": new_report.get("report_type"),
        "old_score": old_report.get("health_score"),
        "new_score": new_report.get("health_score"),
        "health_improvement_score": f"{health_delta:+.0f}" if scores_available else "N/A",
        "narrative": narrative,
        "narrative_source": narrative_source,
        "biomarkers": comparisons,
        "incomparable": incomparable,
    }

@router.get("/export/{report_id}/pdf")
async def export_pdf(report_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    report = await find_report_by_id(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.get("analysis_status") != "analyzed":
        raise HTTPException(status_code=409, detail="This report has not been analysed yet.")
        
    # Set patient name
    report["patient_name"] = current_user["name"]
    report["created_at"] = report["created_at"].strftime('%Y-%m-%d %H:%M') if isinstance(report["created_at"], datetime) else str(report["created_at"])
    
    pdf_bytes = generate_report_pdf(report)
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=medisense_analysis_{report_id}.pdf"}
    )

@router.get("/export/{report_id}/docx")
async def export_docx(report_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    report = await find_report_by_id(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.get("analysis_status") != "analyzed":
        raise HTTPException(status_code=409, detail="This report has not been analysed yet.")
        
    report["patient_name"] = current_user["name"]
    report["created_at"] = report["created_at"].strftime('%Y-%m-%d %H:%M') if isinstance(report["created_at"], datetime) else str(report["created_at"])
    
    docx_bytes = generate_report_docx(report)
    
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=medisense_analysis_{report_id}.docx"}
    )

@router.post("/export/{report_id}/share")
async def generate_share_link(
    report_id: str,
    expires_in_hours: int = Form(24),
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    report = await find_report_by_id(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.get("analysis_status") != "analyzed":
        raise HTTPException(
            status_code=409,
            detail="This report has not been analysed yet, so there is nothing to share.",
        )

    # Generate unique share token
    share_token = str(uuid.uuid4())
    
    # Store token in DB
    share_doc = {
        "token": share_token,
        "report_id": report_id,
        "user_id": current_user["id"],
        "created_at": datetime.now(timezone.utc),
        "expires_in_hours": expires_in_hours
    }
    await db.shared_links.insert_one(share_doc)
    
    return {
        "share_token": share_token,
        "expires_in": f"{expires_in_hours} hours",
        "url": f"/api/v1/reports/shared/view/{share_token}"
    }

@router.get("/shared/view/{token}")
async def view_shared_report(token: str, db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    share_record = await db.shared_links.find_one({"token": token})
    if not share_record:
        raise HTTPException(status_code=404, detail="Invalid or expired sharing link")
        
    # Check expiration
    created = share_record["created_at"]
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created.replace('Z', '+00:00'))
        except Exception:
            created = datetime.now(timezone.utc)
    if hasattr(created, 'tzinfo') and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    hours_limit = share_record["expires_in_hours"]
    elapsed = (datetime.now(timezone.utc) - created).total_seconds() / 3600
    
    if elapsed > hours_limit:
        await db.shared_links.delete_one({"token": token})
        raise HTTPException(status_code=410, detail="Sharing link has expired")
        
    # Fetch report
    report_id = share_record["report_id"]
    report = await find_report_by_id(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    # Clean sensitive user ID details for public share
    serialized = serialize_doc(report)
    for internal_field in ("user_id", "gridfs_id"):
        serialized.pop(internal_field, None)
    return serialized
