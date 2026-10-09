import asyncio
import json
import os
from motor.motor_asyncio import AsyncIOMotorClient
from app.auth.jwt import get_password_hash

async def sync_data():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["medisense_ai"]

    # Check local db backup
    backup_file = os.path.join(os.path.dirname(__file__), "data", "medisense_local_db.backup-2026-10-09.json")
    if not os.path.exists(backup_file):
        print("No backup file found at", backup_file)
        return

    with open(backup_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 1. Users
    for u in data.get("users", []):
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            # Hash password if needed or keep existing hash
            await db.users.insert_one(u)
            print(f"Inserted user: {u['email']}")
        else:
            print(f"User already exists: {u['email']}")

    # 2. Reports
    for r in data.get("reports", []):
        if r.get("biomarkers") and not r.get("analysis_status"):
            r["analysis_status"] = "analyzed"
        existing = await db.reports.find_one({"_id": r["_id"]})
        if not existing:
            await db.reports.insert_one(r)
            print(f"Inserted report: {r.get('filename')}")
        else:
            await db.reports.update_one({"_id": r["_id"]}, {"$set": {"analysis_status": "analyzed"}})
            print(f"Updated report status: {r.get('filename')}")


    # 3. Chats
    for c in data.get("chats", []):
        existing = await db.chats.find_one({"_id": c["_id"]})
        if not existing:
            await db.chats.insert_one(c)
            print(f"Inserted chat: {c.get('_id')}")

    # 4. Notifications
    for n in data.get("notifications", []):
        existing = await db.notifications.find_one({"_id": n["_id"]})
        if not existing:
            await db.notifications.insert_one(n)
            print(f"Inserted notification: {n.get('title')}")

    print("Sync to MongoDB complete!")

if __name__ == "__main__":
    asyncio.run(sync_data())
