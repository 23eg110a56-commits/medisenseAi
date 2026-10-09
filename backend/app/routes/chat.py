import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Form
from pydantic import BaseModel
from bson import ObjectId
from app.database.connection import get_db
from app.auth.jwt import get_current_user
from app.services.rag_service import rag_engine
from app.services.gemini_service import gemini_client

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatMessageRequest(BaseModel):
    report_id: str
    message: str
    language: str = "en"  # "en", "hi", "te"

@router.post("/send")
async def send_chat_message(req: ChatMessageRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    report = await db.reports.find_one({"_id": str(req.report_id), "user_id": str(current_user["id"])})
    if not report:
        try:
            report = await db.reports.find_one({"_id": ObjectId(req.report_id), "user_id": str(current_user["id"])})
        except Exception:
            pass
            
    if not report:
        raise HTTPException(status_code=404, detail="Medical report not found")

    extracted_text = report.get("extracted_text") or ""
    is_analyzed = report.get("analysis_status") == "analyzed" or bool(report.get("biomarkers"))
    if not is_analyzed or not extracted_text.strip():
        raise HTTPException(
            status_code=409,
            detail=(
                "This report has not been analysed yet, so there is no grounded content to "
                "answer from. Review the extracted text and run the analysis first."
            ),
        )

    # 1. Query RAG engine for trusted guidelines
    rag_results = rag_engine.query(req.message, top_k=3)
    retrieved_context = "\n\n".join([
        f"[Source: {item['source']}]\n{item['content']}"
        for item in rag_results
    ])
    
    # 2. Get past chat history from database
    chat_session = await db.chats.find_one({
        "user_id": current_user["id"],
        "report_id": req.report_id
    })
    
    chat_history = []
    if chat_session:
        # Limit history to last 10 messages to save context tokens
        chat_history = chat_session.get("messages", [])[-10:]
        
    # Map roles to fit Gemini prompt expectations
    formatted_history = []
    for msg in chat_history:
        formatted_history.append({
            "role": msg["role"],
            "content": msg["content"]
        })
        
    # 3. Call the assistant, grounded in this report and the retrieved guidelines
    report_context = (
        f"Report Type: {report.get('report_type')}\n"
        f"Report Date: {_iso(report.get('created_at'))}\n"
        f"Summary: {report.get('summary')}\n"
        f"Parsed results: {json.dumps(report.get('biomarkers', []))}\n"
        f"Extracted text:\n{extracted_text}"
    )

    ai_response = await gemini_client.chat_assistant(
        user_message=req.message,
        report_text=report_context,
        chat_history=formatted_history,
        retrieved_context=retrieved_context,
        language=req.language
    )
    
    # 4. Save User message & AI response in database
    new_user_msg = {
        "role": "user",
        "content": req.message,
        "created_at": datetime.now(timezone.utc)
    }
    
    new_ai_msg = {
        "role": "assistant",
        "content": ai_response,
        "created_at": datetime.now(timezone.utc)
    }
    
    if chat_session:
        await db.chats.update_one(
            {"_id": chat_session["_id"]},
            {"$push": {"messages": {"$each": [new_user_msg, new_ai_msg]}}}
        )
    else:
        new_session = {
            "user_id": current_user["id"],
            "report_id": req.report_id,
            "created_at": datetime.now(timezone.utc),
            "messages": [new_user_msg, new_ai_msg]
        }
        await db.chats.insert_one(new_session)
        
    return {
        "response": ai_response,
        "sources": [item["source"] for item in rag_results],
        "ai_generated": gemini_client.is_configured,
        "retrieval_mode": rag_engine.status()["mode"],
        "notice": None if gemini_client.is_configured else (
            "No AI model is configured on this server. The reply contains only evidence "
            "retrieved from your report and the bundled reference documents."
        ),
    }


def _iso(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value or "")


@router.get("/history/{report_id}")
async def get_chat_history(report_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    chat_session = await db.chats.find_one({
        "user_id": current_user["id"],
        "report_id": report_id
    })
    
    if not chat_session:
        return []
        
    return [
        {
            "role": msg.get("role"),
            "content": msg.get("content"),
            "created_at": _iso(msg.get("created_at")),
        }
        for msg in chat_session.get("messages", [])
    ]

@router.post("/clear/{report_id}")
async def clear_chat_history(report_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    await db.chats.delete_one({
        "user_id": current_user["id"],
        "report_id": report_id
    })
    return {"message": "Chat history cleared successfully"}
