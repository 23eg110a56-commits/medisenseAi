import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from app.database.connection import get_db
from app.auth.jwt import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

# Serialize MongoDB documents
def serialize_doc(doc):
    if not doc:
        return None
    doc["id"] = str(doc["_id"])
    del doc["_id"]
    return doc

@router.get("/all")
async def get_notifications(current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    cursor = db.notifications.find({"user_id": current_user["id"]}).sort("created_at", -1)
    notifications = []
    async for doc in cursor:
        notifications.append(serialize_doc(doc))
    return notifications

@router.post("/read/{notification_id}")
async def mark_as_read(notification_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    try:
        result = await db.notifications.update_one(
            {"_id": ObjectId(notification_id), "user_id": current_user["id"]},
            {"$set": {"read": True}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"message": "Notification marked as read"}
    except Exception as e:
         if isinstance(e, HTTPException):
              raise e
         raise HTTPException(status_code=400, detail="Invalid Notification ID format")

@router.post("/read-all")
async def mark_all_as_read(current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    await db.notifications.update_many(
        {"user_id": current_user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}
