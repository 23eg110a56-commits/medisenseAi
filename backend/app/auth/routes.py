import logging
import random
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from app.database.connection import get_db, get_fs
from app.config import settings
from app.auth.models import (
    UserRegister, UserLogin, Token, UserOut, ProfileUpdate,
    ForgotPasswordRequest, OTPVerifyRequest, ResetPasswordRequest
)
from app.auth.jwt import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, get_current_user
)

router = APIRouter()
logger = logging.getLogger(__name__)

OTP_TTL_MINUTES = 10


def _store_otp_query(email: str):
    return {"email": email}


async def _issue_otp(db, email: str) -> str:
    """Create a short-lived one-time code.

    The code is never logged and never returned to the caller unless
    EXPOSE_DEV_OTP is explicitly enabled, because anyone holding it can reset
    the account password.
    """
    otp = f"{random.randint(100000, 999999)}"
    await db.otps.update_one(
        _store_otp_query(email),
        {"$set": {
            "otp": otp,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
        }},
        upsert=True,
    )
    return otp


async def _consume_otp(db, email: str, otp: str) -> bool:
    """Validate and invalidate a code. Always deletes it, so codes are single-use."""
    record = await db.otps.find_one(_store_otp_query(email))
    if not record:
        return False
    try:
        await db.otps.delete_one(_store_otp_query(email))
    except Exception:
        logger.warning("Could not delete OTP record for %s", email)

    if record.get("otp") != otp:
        return False

    expires_at = record.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            expires_at = None
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            return False
    return True


@router.post("/register", response_model=Token)
async def register(user_in: UserRegister, db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user_exists = await db.users.find_one({"email": user_in.email})
    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The user with this email already exists in the system.",
        )

    hashed_password = get_password_hash(user_in.password)
    user_dict = {
        "email": user_in.email,
        "hashed_password": hashed_password,
        "name": user_in.name,
        "role": "user",
        "language": user_in.language,
        "created_at": datetime.now(timezone.utc),
        "is_verified": False,
        "age": None,
        "gender": None,
        "weight": None,
        "height": None,
        "systolic_bp": None,
        "diastolic_bp": None,
        "fasting_sugar": None
    }

    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)

    await _issue_otp(db, user_in.email)

    access_token = create_access_token(subject=user_id, role="user")
    refresh_token = create_refresh_token(subject=user_id, role="user")

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        role="user",
        user_id=user_id,
        name=user_in.name,
        email=user_in.email
    )

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
        
    user_id = str(user["_id"])
    access_token = create_access_token(subject=user_id, role=user["role"])
    refresh_token = create_refresh_token(subject=user_id, role=user["role"])
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user["role"],
        user_id=user_id,
        name=user["name"],
        email=user["email"]
    )

@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user = await db.users.find_one({"email": req.email})
    generic_message = "If this email is registered, a password reset code has been issued."

    if not user:
        # Do not reveal whether the account exists.
        return {"message": generic_message, "delivery": "not_applicable"}

    otp = await _issue_otp(db, req.email)

    if settings.EXPOSE_DEV_OTP:
        return {
            "message": generic_message,
            "delivery": "dev_exposed",
            "dev_otp": otp,
            "notice": (
                "EXPOSE_DEV_OTP is enabled, so the code is returned here instead of being "
                "emailed. Disable this setting outside local development."
            ),
        }

    return {
        "message": generic_message,
        "delivery": "not_configured",
        "notice": (
            "No email delivery service is configured on this server, so the reset code "
            "could not be sent. Set EXPOSE_DEV_OTP=true for local development, or connect "
            "an email provider."
        ),
    }


@router.post("/verify-otp")
async def verify_otp(req: OTPVerifyRequest, db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if not await _consume_otp(db, req.email, req.otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )

    await db.users.update_one({"email": req.email}, {"$set": {"is_verified": True}})
    return {"message": "OTP verified successfully"}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if not await _consume_otp(db, req.email, req.otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )

    hashed_password = get_password_hash(req.new_password)
    await db.users.update_one(
        {"email": req.email},
        {"$set": {"hashed_password": hashed_password, "is_verified": True}}
    )
    return {"message": "Password reset successfully"}

@router.get("/profile", response_model=UserOut)
async def get_profile(current_user=Depends(get_current_user)):
    return current_user

@router.put("/profile/update", response_model=UserOut)
async def update_profile(profile: ProfileUpdate, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    update_data = {k: v for k, v in profile.dict().items() if v is not None}
    if not update_data:
         return current_user
         
    query = {"_id": current_user["id"]}
    try:
        query = {"_id": ObjectId(current_user["id"])}
    except Exception:
        pass
         
    await db.users.update_one(
        query,
        {"$set": update_data}
    )
    
    updated_user = await db.users.find_one(query)
    if not updated_user:
        updated_user = await db.users.find_one({"_id": current_user["id"]})
    updated_user["id"] = str(updated_user.get("_id", current_user["id"]))
    return updated_user


@router.delete("/account")
async def delete_account(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
    fs=Depends(get_fs),
):
    """Erase this account and every record derived from it.

    Uploaded reports are sensitive personal data, so deletion has to reach the
    stored files, chat transcripts, public share links, notifications and reset
    codes — not just the user document.
    """
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user_id = current_user["id"]

    if fs is not None:
        cursor = db.reports.find({"user_id": user_id})
        async for report in cursor:
            gridfs_id = report.get("gridfs_id")
            if not gridfs_id:
                continue
            try:
                await fs.delete(ObjectId(gridfs_id))
            except Exception as exc:
                logger.error("Could not delete stored file for report %s: %s", report.get("_id"), exc)

    deleted = {}
    for name in ("reports", "chats", "shared_links", "notifications"):
        try:
            result = await getattr(db, name).delete_many({"user_id": user_id})
            deleted[name] = getattr(result, "deleted_count", 0)
        except Exception as exc:
            logger.error("Could not clear %s during account deletion: %s", name, exc)
            deleted[name] = None

    # Password-reset codes are keyed by email rather than by user id.
    try:
        result = await db.otps.delete_many(_store_otp_query(current_user.get("email", "")))
        deleted["otps"] = getattr(result, "deleted_count", 0)
    except Exception as exc:
        logger.error("Could not clear reset codes during account deletion: %s", exc)
        deleted["otps"] = None

    try:
        result = await db.users.delete_one({"_id": current_user["_id"]})
    except Exception:
        result = await db.users.delete_one({"_id": user_id})

    if getattr(result, "deleted_count", 0) == 0:
        raise HTTPException(status_code=500, detail="Account could not be deleted")

    # Only record counts: no report contents or identifiers leave this function.
    logger.info("Account deleted; cascade counts: %s", deleted)
    return {
        "message": "Your account and all associated records were deleted.",
        "deleted": deleted,
    }
