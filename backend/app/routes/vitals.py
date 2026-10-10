import logging
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.database.connection import get_db
from app.auth.jwt import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


class VitalLogCreate(BaseModel):
    blood_sugar: Optional[float] = Field(None, ge=20, le=700, description="Blood glucose level in mg/dL")
    sugar_type: Optional[str] = Field("fasting", description="Reading type: fasting, post_meal, random")
    hba1c: Optional[float] = Field(None, ge=3.0, le=20.0, description="HbA1c percentage (%)")
    hemoglobin: Optional[float] = Field(None, ge=3.0, le=25.0, description="Hemoglobin in g/dL")
    systolic_bp: Optional[int] = Field(None, ge=50, le=260, description="Systolic blood pressure (mmHg)")
    diastolic_bp: Optional[int] = Field(None, ge=30, le=180, description="Diastolic blood pressure (mmHg)")
    weight: Optional[float] = Field(None, ge=20, le=400, description="Weight in kg")
    heart_rate: Optional[int] = Field(None, ge=30, le=250, description="Heart rate in bpm")
    notes: Optional[str] = Field(None, max_length=500, description="Optional personal notes")
    recorded_at: Optional[datetime] = None


class VitalLogOut(BaseModel):
    id: str
    user_id: str
    blood_sugar: Optional[float] = None
    sugar_type: Optional[str] = "fasting"
    hba1c: Optional[float] = None
    hemoglobin: Optional[float] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    weight: Optional[float] = None
    heart_rate: Optional[int] = None
    notes: Optional[str] = None
    recorded_at: datetime


def _serialize(doc: dict) -> dict:
    return {
        "id": str(doc.get("_id", "")),
        "user_id": str(doc.get("user_id", "")),
        "blood_sugar": doc.get("blood_sugar"),
        "sugar_type": doc.get("sugar_type", "fasting"),
        "hba1c": doc.get("hba1c"),
        "hemoglobin": doc.get("hemoglobin"),
        "systolic_bp": doc.get("systolic_bp"),
        "diastolic_bp": doc.get("diastolic_bp"),
        "weight": doc.get("weight"),
        "heart_rate": doc.get("heart_rate"),
        "notes": doc.get("notes"),
        "recorded_at": doc.get("recorded_at") or datetime.now(timezone.utc),
    }


@router.get("", response_model=List[VitalLogOut])
@router.get("/all", response_model=List[VitalLogOut])
async def get_user_vitals(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Retrieve all logged vital readings for the authenticated user."""
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    cursor = db.vitals.find({"user_id": current_user["id"]}).sort("recorded_at", 1)
    docs = await cursor.to_list(length=200)
    return [_serialize(d) for d in docs]


@router.post("", response_model=VitalLogOut)
async def create_vital_log(
    payload: VitalLogCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Log a new health vital reading (blood sugar, hemoglobin, blood pressure, etc.)."""
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    # Validate that at least one metric is provided
    has_metric = any([
        payload.blood_sugar is not None,
        payload.hba1c is not None,
        payload.hemoglobin is not None,
        payload.systolic_bp is not None,
        payload.diastolic_bp is not None,
        payload.weight is not None,
        payload.heart_rate is not None,
    ])
    if not has_metric:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one health measurement (sugar, hemoglobin, BP, etc.) must be provided.",
        )

    doc = {
        "user_id": current_user["id"],
        "blood_sugar": payload.blood_sugar,
        "sugar_type": payload.sugar_type or "fasting",
        "hba1c": payload.hba1c,
        "hemoglobin": payload.hemoglobin,
        "systolic_bp": payload.systolic_bp,
        "diastolic_bp": payload.diastolic_bp,
        "weight": payload.weight,
        "heart_rate": payload.heart_rate,
        "notes": payload.notes or "",
        "recorded_at": payload.recorded_at or datetime.now(timezone.utc),
    }

    result = await db.vitals.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Sync latest readings to user's profile baselines
    profile_updates = {}
    if payload.blood_sugar is not None and (payload.sugar_type or "fasting") == "fasting":
        profile_updates["fasting_sugar"] = payload.blood_sugar
    if payload.systolic_bp is not None:
        profile_updates["systolic_bp"] = payload.systolic_bp
    if payload.diastolic_bp is not None:
        profile_updates["diastolic_bp"] = payload.diastolic_bp
    if payload.weight is not None:
        profile_updates["weight"] = payload.weight

    if profile_updates:
        query = {"_id": current_user["id"]}
        try:
            query = {"_id": ObjectId(current_user["id"])}
        except Exception:
            pass
        await db.users.update_one(query, {"$set": profile_updates})

    return _serialize(doc)


@router.delete("/{vital_id}")
async def delete_vital_log(
    vital_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete a logged vital reading."""
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    query = {"_id": vital_id, "user_id": current_user["id"]}
    try:
        query = {"_id": ObjectId(vital_id), "user_id": current_user["id"]}
    except Exception:
        pass

    res = await db.vitals.delete_one(query)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vital reading not found")

    return {"message": "Vital reading deleted successfully"}
