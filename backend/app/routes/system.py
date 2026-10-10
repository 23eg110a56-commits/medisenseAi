"""Public capability endpoint.

The UI must be able to tell the user when a feature is running in a degraded
mode (no language model, no OCR engine, no vector index) instead of presenting
offline output as though a model produced it. No secrets or patient data are
exposed here.
"""

import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.database.connection import db as db_state
from app.services.gemini_service import gemini_client
from app.services.ocr_service import ocr_engine_status
from app.services.rag_service import rag_engine

router = APIRouter()


class ConfigureGeminiRequest(BaseModel):
    api_key: str = Field(..., min_length=8, description="Google Gemini API key")


@router.post("/configure-gemini")
async def configure_gemini(payload: ConfigureGeminiRequest):
    key = payload.api_key.strip()
    success = gemini_client.configure(key)
    if not success:
        raise HTTPException(
            status_code=400,
            detail=gemini_client.config_error or "Failed to configure Gemini AI with this key."
        )

    # Persist in backend/.env
    try:
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
        if env_path.exists():
            content = env_path.read_text(encoding="utf-8")
            if "GEMINI_API_KEY=" in content:
                new_content = re.sub(
                    r'GEMINI_API_KEY=.*',
                    f'GEMINI_API_KEY="{key}"',
                    content
                )
            else:
                new_content = content + f'\nGEMINI_API_KEY="{key}"\n'
            env_path.write_text(new_content, encoding="utf-8")
    except Exception as exc:
        # Key is active in memory even if disk write fails
        pass

    return {
        "success": True,
        "message": "Gemini AI configured successfully!",
        "llm": gemini_client.status(),
    }


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
            "allowed_extensions": sorted({"pdf", "png", "jpg", "jpeg", "webp"}),
        },
        "dev_otp_exposed": settings.EXPOSE_DEV_OTP,
    }
