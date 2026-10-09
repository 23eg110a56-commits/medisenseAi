import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from app.database.connection import get_db
from app.auth.jwt import RoleChecker, get_current_user
from app.services.rag_service import rag_engine

router = APIRouter(dependencies=[Depends(RoleChecker(["admin"]))])
logger = logging.getLogger(__name__)

# Serialize MongoDB documents
def serialize_doc(doc):
    if not doc:
        return None
    doc["id"] = str(doc["_id"])
    del doc["_id"]
    return doc

@router.get("/statistics")
async def get_system_statistics(db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    total_users = await db.users.count_documents({})
    total_reports = await db.reports.count_documents({})
    total_chats = await db.chats.count_documents({})
    total_notifications = await db.notifications.count_documents({})
    
    # Calculate average health score
    pipeline = [{"$group": {"_id": None, "avg_score": {"$avg": "$health_score"}}}]
    cursor = db.reports.aggregate(pipeline)
    avg_score_result = await cursor.to_list(length=1)
    avg_val = avg_score_result[0].get("avg_score") if avg_score_result else None
    avg_health_score = round(avg_val, 1) if avg_val is not None else 0.0
    
    # Get count of reports by type
    pipeline_type = [{"$group": {"_id": "$report_type", "count": {"$sum": 1}}}]
    cursor_type = db.reports.aggregate(pipeline_type)
    report_types = await cursor_type.to_list(length=100)
    report_type_counts = {item["_id"]: item["count"] for item in report_types if item["_id"]}
    
    return {
        "users_count": total_users,
        "reports_count": total_reports,
        "chats_count": total_chats,
        "notifications_count": total_notifications,
        "average_health_score": avg_health_score,
        "report_types_distribution": report_type_counts,
        "rag_status": {
            "total_chunks": len(rag_engine.chunks),
            "using_ml_libs": hasattr(rag_engine, "model") and rag_engine.model is not None
        }
    }

@router.get("/users")
async def list_users(db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    cursor = db.users.find({}).sort("created_at", -1)
    users = []
    async for doc in cursor:
        user = serialize_doc(doc)
        if "hashed_password" in user:
            del user["hashed_password"]
        users.append(user)
    return users

@router.delete("/users/{user_id}")
async def delete_user(user_id: str, db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
         raise HTTPException(status_code=400, detail="Invalid User ID format")
         
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user["role"] == "admin":
         raise HTTPException(status_code=400, detail="Cannot delete default admin account")
         
    # Cascade delete reports, chats, notifications for this user
    await db.users.delete_one({"_id": ObjectId(user_id)})
    await db.reports.delete_many({"user_id": user_id})
    await db.chats.delete_many({"user_id": user_id})
    await db.notifications.delete_many({"user_id": user_id})
    
    return {"message": "User and associated data deleted successfully"}

@router.get("/reports")
async def list_all_reports(db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    cursor = db.reports.find({}).sort("created_at", -1)
    reports = []
    async for doc in cursor:
        reports.append(serialize_doc(doc))
    return reports

@router.get("/knowledge-base/chunks")
async def get_kb_chunks():
    # Return chunks metadata
    return rag_engine.chunks

@router.post("/knowledge-base/rebuild")
async def rebuild_kb_index():
    try:
        rag_engine.rebuild_index()
        return {
            "message": "FAISS index rebuilt successfully!",
            "total_chunks": len(rag_engine.chunks)
        }
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to rebuild index: {str(e)}")
