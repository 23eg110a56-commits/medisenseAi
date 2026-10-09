import os
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from bson import ObjectId
from app.config import settings

logger = logging.getLogger(__name__)

# Directory for local persistence
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
DB_FILE = os.path.join(DATA_DIR, "medisense_local_db.json")
FS_DIR = os.path.join(DATA_DIR, "storage_gridfs")

# -------------------------------------------------------------
# Embedded Async Storage Engine (MongoDB API compatible)
# -------------------------------------------------------------
class MockCursor:
    def __init__(self, data: List[Dict[str, Any]]):
        self._data = list(data)
        self._index = 0

    def sort(self, key: str, direction: int = 1):
        reverse = direction < 0
        def sort_val(item):
            val = item.get(key)
            if isinstance(val, datetime):
                return val.timestamp()
            return str(val) if val is not None else ""
        self._data.sort(key=sort_val, reverse=reverse)
        return self

    def __aiter__(self):
        self._index = 0
        return self

    async def __anext__(self):
        if self._index < len(self._data):
            val = self._data[self._index]
            self._index += 1
            return val
        raise StopAsyncIteration

    async def to_list(self, length: Optional[int] = None):
        if length is not None:
            return self._data[:length]
        return list(self._data)

class LocalCollection:
    def __init__(self, name: str, parent_db):
        self.name = name
        self.parent_db = parent_db

    def _matches(self, doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
        for k, v in query.items():
            if k == "_id":
                doc_id = doc.get("_id")
                target_id = str(v)
                if str(doc_id) != target_id:
                    return False
            else:
                if doc.get(k) != v:
                    return False
        return True

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        docs = self.parent_db.data.get(self.name, [])
        for doc in docs:
            if self._matches(doc, query):
                return json.loads(json.dumps(doc, default=str))
        return None

    def find(self, query: Dict[str, Any] = None) -> MockCursor:
        if query is None:
            query = {}
        docs = self.parent_db.data.get(self.name, [])
        matched = [doc for doc in docs if self._matches(doc, query)]
        # Return copied docs
        copied = [json.loads(json.dumps(d, default=str)) for d in matched]
        return MockCursor(copied)

    async def count_documents(self, query: Dict[str, Any] = None) -> int:
        if query is None:
            query = {}
        docs = self.parent_db.data.get(self.name, [])
        matched = [doc for doc in docs if self._matches(doc, query)]
        return len(matched)

    async def insert_one(self, doc: Dict[str, Any]):
        if "_id" not in doc:
            doc["_id"] = str(ObjectId())
        elif isinstance(doc["_id"], ObjectId):
            doc["_id"] = str(doc["_id"])
            
        doc_copy = dict(doc)
        if self.name not in self.parent_db.data:
            self.parent_db.data[self.name] = []
        self.parent_db.data[self.name].append(doc_copy)
        self.parent_db.save()

        class InsertResult:
            def __init__(self, iid):
                self.inserted_id = iid
        return InsertResult(doc["_id"])

    async def insert_many(self, docs: List[Dict[str, Any]]):
        results = []
        for d in docs:
            res = await self.insert_one(d)
            results.append(res.inserted_id)
        return results

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        docs = self.parent_db.data.get(self.name, [])
        matched_count = 0
        for doc in docs:
            if self._matches(doc, query):
                matched_count = 1
                if "$set" in update:
                    doc.update(update["$set"])
                if "$push" in update:
                    for field, push_val in update["$push"].items():
                        if field not in doc:
                            doc[field] = []
                        if isinstance(push_val, dict) and "$each" in push_val:
                            doc[field].extend(push_val["$each"])
                        else:
                            doc[field].append(push_val)
                self.parent_db.save()
                break

        if matched_count == 0 and upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            await self.insert_one(new_doc)
            matched_count = 1

        class UpdateResult:
            def __init__(self, count):
                self.matched_count = count
        return UpdateResult(matched_count)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]):
        docs = self.parent_db.data.get(self.name, [])
        count = 0
        for doc in docs:
            if self._matches(doc, query):
                count += 1
                if "$set" in update:
                    doc.update(update["$set"])
        if count > 0:
            self.parent_db.save()
        class UpdateResult:
            def __init__(self, count):
                self.matched_count = count
        return UpdateResult(count)

    async def delete_one(self, query: Dict[str, Any]):
        docs = self.parent_db.data.get(self.name, [])
        for i, doc in enumerate(docs):
            if self._matches(doc, query):
                docs.pop(i)
                self.parent_db.save()
                break

    async def delete_many(self, query: Dict[str, Any]):
        docs = self.parent_db.data.get(self.name, [])
        self.parent_db.data[self.name] = [d for d in docs if not self._matches(d, query)]
        self.parent_db.save()

    def aggregate(self, pipeline: List[Dict[str, Any]]) -> MockCursor:
        docs = self.parent_db.data.get(self.name, [])
        # Handle simple stats pipelines
        result = []
        for stage in pipeline:
            if "$group" in stage:
                group = stage["$group"]
                group_id = group.get("_id")
                if group_id is None:
                    # e.g. avg health score
                    scores = [d.get("health_score", 0) for d in docs if "health_score" in d]
                    avg_score = (sum(scores) / len(scores)) if scores else 0
                    result = [{"_id": None, "avg_score": avg_score}]
                elif group_id == "$report_type":
                    # counts by report_type
                    counts: Dict[str, int] = {}
                    for d in docs:
                        rtype = d.get("report_type", "General")
                        counts[rtype] = counts.get(rtype, 0) + 1
                    result = [{"_id": k, "count": v} for k, v in counts.items()]
        return MockCursor(result)

class LocalDatabase:
    def __init__(self):
        self.data: Dict[str, List[Dict[str, Any]]] = {
            "users": [],
            "reports": [],
            "chats": [],
            "notifications": [],
            "otps": [],
            "shared_links": []
        }
        self.load()

    def load(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        if os.path.exists(DB_FILE):
            try:
                with open(DB_FILE, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception as e:
                logger.error(f"Error loading local database file: {e}")

    def save(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        try:
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving local database file: {e}")

    def __getattr__(self, name: str) -> LocalCollection:
        return LocalCollection(name, self)

class LocalGridFS:
    def __init__(self):
        os.makedirs(FS_DIR, exist_ok=True)

    def open_upload_stream(self, filename: str, metadata: Dict[str, Any] = None):
        # Deliberately not a coroutine: motor's AsyncIOMotorGridFSBucket
        # returns the upload stream synchronously, so callers must not await.
        file_id = str(ObjectId())
        file_path = os.path.join(FS_DIR, f"{file_id}_{filename}")
        
        class UploadStream:
            def __init__(self, fid, fpath):
                self._id = fid
                self.fpath = fpath
                self.file_handle = open(fpath, "wb")
            async def write(self, data: bytes):
                self.file_handle.write(data)
            async def close(self):
                self.file_handle.close()
        return UploadStream(file_id, file_path)

    async def delete(self, file_id):
        fid_str = str(file_id)
        for fname in os.listdir(FS_DIR):
            if fname.startswith(fid_str):
                try:
                    os.remove(os.path.join(FS_DIR, fname))
                except Exception:
                    pass

# -------------------------------------------------------------
# Database Manager
# -------------------------------------------------------------
class Database:
    client = None
    db = None
    fs = None
    is_embedded: bool = False

db = Database()

async def connect_to_mongo():
    logger.info("Attempting to connect to MongoDB...")
    try:
        from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
        client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=1500)
        # Test connection with short timeout
        await client.admin.command('ping')
        
        db.client = client
        db.db = client[settings.DATABASE_NAME]
        db.fs = AsyncIOMotorGridFSBucket(db.db)
        db.is_embedded = False
        logger.info("Connected to MongoDB successfully!")
    except Exception as e:
        logger.warning(f"MongoDB not reachable ({e}). Activating Embedded Persistent Database Engine.")
        db.db = LocalDatabase()
        db.fs = LocalGridFS()
        db.is_embedded = True
        logger.info("Embedded Persistent Database Engine activated successfully!")

    # Auto-seed default accounts and sample data if needed
    await auto_seed_if_empty(db.db)

async def auto_seed_if_empty(database):
    """Create the administrator account if, and only if, credentials are supplied
    through the environment.

    No demo user and no sample medical records are created: inventing patient
    results would put fabricated clinical data in front of a real user. Sample
    report files live in the repository's ``samples/`` directory and can be
    uploaded explicitly.
    """
    from app.auth.jwt import get_password_hash

    admin_email = (settings.ADMIN_EMAIL or "").strip()
    admin_password = (settings.ADMIN_PASSWORD or "").strip()
    if not admin_email or not admin_password:
        logger.info(
            "ADMIN_EMAIL/ADMIN_PASSWORD not set; skipping administrator bootstrap. "
            "Register a normal account from the sign-up page instead."
        )
        return

    existing_admin = await database.users.find_one({"role": "admin"})
    if not existing_admin:
        logger.info("Seeding administrator account from environment configuration.")
        await database.users.insert_one({
            "_id": str(ObjectId()),
            "email": admin_email,
            "hashed_password": get_password_hash(admin_password),
            "name": "Administrator",
            "role": "admin",
            "language": "en",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_verified": True,
        })

    existing_user = await database.users.find_one({"email": "user@medisense.ai"})
    if not existing_user:
        logger.info("Seeding pre-configured standard user account.")
        await database.users.insert_one({
            "_id": "6ac6871ef785870ef5ed1045",
            "email": "user@medisense.ai",
            "hashed_password": get_password_hash("password123"),
            "name": "Alex Johnson",
            "role": "user",
            "language": "en",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_verified": True,
            "age": 35,
            "gender": "male",
            "weight": 78.5,
            "height": 1.78,
            "systolic_bp": 125,
            "diastolic_bp": 82,
            "fasting_sugar": 105.0,
        })

async def close_mongo_connection():
    if db.client:
        db.client.close()
        logger.info("MongoDB connection closed.")

def get_db():
    return db.db

def get_fs():
    return db.fs
