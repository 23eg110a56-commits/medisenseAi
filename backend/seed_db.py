"""Create a clearly-labelled demo account so the UI has something to show.

This is a development convenience, not production data. Every clinical field it
writes is produced by the same ``analyze_text()`` parser the application uses, so
no diagnosis, summary or risk claim is invented here. Seeded records are marked
``is_demo`` and their filenames are prefixed ``DEMO_`` so they are obviously not
real patient results wherever they appear in the UI.

The script never deletes data belonging to other accounts. Re-running it refreshes
only the demo account's own records.

Usage:
    python seed_db.py --yes-this-is-demo-data
    DEMO_PASSWORD=... python seed_db.py --yes-this-is-demo-data
"""

import argparse
import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.auth.jwt import get_password_hash
from app.database.connection import connect_to_mongo, close_mongo_connection, get_db
from app.services.report_parser import analyze_text

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed_db")

DEMO_EMAIL = "demo@medisense.local"
CONFIRMATION_FLAG = "--yes-this-is-demo-data"

# Text in the same columnar shape the OCR pipeline produces from the files in
# ``samples/``. Values are illustrative and belong to no real patient.
DEMO_REPORTS = [
    {
        "filename": "DEMO_lipid_profile_6_months_ago.pdf",
        "age_days": 180,
        "text": (
            "DEMO DATA - NOT A REAL PATIENT REPORT\n"
            "LIPID PROFILE\n"
            "Total Cholesterol\n268.0\nmg/dL\n< 200.0\nHigh\n"
            "HDL Cholesterol\n31.0\nmg/dL\n> 40.0\nLow\n"
            "LDL Cholesterol\n182.0\nmg/dL\n< 100.0\nHigh\n"
            "Triglycerides\n240.0\nmg/dL\n< 150.0\nHigh\n"
        ),
    },
    {
        "filename": "DEMO_lipid_profile_3_months_ago.pdf",
        "age_days": 90,
        "text": (
            "DEMO DATA - NOT A REAL PATIENT REPORT\n"
            "LIPID PROFILE\n"
            "Total Cholesterol\n224.0\nmg/dL\n< 200.0\nHigh\n"
            "HDL Cholesterol\n38.0\nmg/dL\n> 40.0\nLow\n"
            "LDL Cholesterol\n141.0\nmg/dL\n< 100.0\nHigh\n"
            "Triglycerides\n168.0\nmg/dL\n< 150.0\nHigh\n"
        ),
    },
    {
        "filename": "DEMO_cbc_last_month.pdf",
        "age_days": 30,
        "text": (
            "DEMO DATA - NOT A REAL PATIENT REPORT\n"
            "COMPLETE BLOOD COUNT\n"
            "Hemoglobin\n14.2\ng/dL\n13.5 - 17.5\nNormal\n"
            "Total Leukocyte Count\n7200\n/uL\n4,500-11,000\nNormal\n"
            "Platelet Count\n265000\n/uL\n150000-400000\nNormal\n"
        ),
    },
    {
        "filename": "DEMO_lipid_profile_recent.pdf",
        "age_days": 2,
        "text": (
            "DEMO DATA - NOT A REAL PATIENT REPORT\n"
            "LIPID PROFILE\n"
            "Total Cholesterol\n196.0\nmg/dL\n< 200.0\nNormal\n"
            "HDL Cholesterol\n45.0\nmg/dL\n> 40.0\nNormal\n"
            "LDL Cholesterol\n96.0\nmg/dL\n< 100.0\nNormal\n"
            "Triglycerides\n132.0\nmg/dL\n< 150.0\nNormal\n"
        ),
    },
]


async def upsert_demo_user(database) -> str:
    password = (os.environ.get("DEMO_PASSWORD") or "").strip()
    generated = not password
    if generated:
        password = secrets.token_urlsafe(12)

    existing = await database.users.find_one({"email": DEMO_EMAIL})
    if existing:
        user_id = str(existing["_id"])
        await database.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {"hashed_password": get_password_hash(password), "is_demo": True}},
        )
        logger.info("Demo account already existed; its password was reset.")
    else:
        user_id = str(ObjectId())
        await database.users.insert_one({
            "_id": user_id,
            "email": DEMO_EMAIL,
            "hashed_password": get_password_hash(password),
            "name": "Demo Account",
            "role": "user",
            "language": "en",
            "created_at": datetime.now(timezone.utc),
            "is_verified": True,
            "is_demo": True,
        })
        logger.info("Demo account created.")

    logger.info("  email:    %s", DEMO_EMAIL)
    logger.info("  password: %s", password)
    if generated:
        logger.info("  (generated for this run — set DEMO_PASSWORD to choose your own)")
    logger.info("  This account is for local demonstration only. Do not deploy it.")
    return user_id


async def seed_demo_reports(database, user_id: str) -> None:
    """Replace only the demo account's own reports."""
    await database.reports.delete_many({"user_id": user_id, "is_demo": True})
    await database.chats.delete_many({"user_id": user_id})

    now = datetime.now(timezone.utc)
    for spec in DEMO_REPORTS:
        analysis = analyze_text(spec["text"], language="en")
        await database.reports.insert_one({
            "_id": str(ObjectId()),
            "user_id": user_id,
            "is_demo": True,
            "patient_name": "Demo Account",
            "filename": spec["filename"],
            "gridfs_id": None,
            "file_size": len(spec["text"].encode("utf-8")),
            "extracted_text": spec["text"],
            "extraction_engine": "demo_seed",
            "page_count": 1,
            "extraction_warnings": ["Seeded demo record; no file was uploaded."],
            "language": "en",
            "created_at": now - timedelta(days=spec["age_days"]),
            "analysis_status": "analyzed",
            "analyzed_at": now - timedelta(days=spec["age_days"]),
            "text_corrected_by_user": False,
            **{k: analysis[k] for k in (
                "analysis_mode", "report_type", "summary", "biomarkers",
                "health_concerns", "recommendations", "health_score",
                "health_score_basis", "warnings", "unparsed_lines",
                "requires_manual_review", "grounding",
            )},
        })
        logger.info(
            "  seeded %-38s score=%s results=%d",
            spec["filename"], analysis["health_score"], len(analysis["biomarkers"]),
        )

    await database.notifications.insert_one({
        "_id": str(ObjectId()),
        "user_id": user_id,
        "is_demo": True,
        "title": "Demo data loaded",
        "message": (
            "These records were generated by seed_db.py for local demonstration. "
            "They are not real patient results and carry no clinical meaning."
        ),
        "type": "info",
        "read": False,
        "created_at": now,
    })


async def main() -> int:
    await connect_to_mongo()
    database = get_db()
    if database is None:
        logger.error("No database available.")
        return 1

    user_id = await upsert_demo_user(database)
    await seed_demo_reports(database, user_id)

    logger.info("Demo seeding complete. Sign in at the login page with the credentials above.")
    await close_mongo_connection()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        CONFIRMATION_FLAG,
        action="store_true",
        help="acknowledge that this writes labelled demo data into the database",
    )
    args = parser.parse_args()

    if not getattr(args, "yes_this_is_demo_data"):
        parser.error(
            f"refusing to run without {CONFIRMATION_FLAG}. This script writes demo "
            "records into the database; confirm you mean to do that."
        )

    raise SystemExit(asyncio.run(main()))
