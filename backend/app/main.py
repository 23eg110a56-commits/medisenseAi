import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.connection import connect_to_mongo, close_mongo_connection
from app.auth.routes import router as auth_router
from app.routes.reports import router as reports_router
from app.routes.chat import router as chat_router
from app.routes.admin import router as admin_router
from app.routes.notifications import router as notifications_router
from app.routes.system import router as system_router
from app.routes.vitals import router as vitals_router
from app.services.rag_service import rag_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


def _ensure_secret_key() -> None:
    """Refuse to sign tokens with a value that is public in this repository."""
    if settings.SECRET_KEY:
        return
    settings.SECRET_KEY = secrets.token_urlsafe(48)
    logger.warning(
        "SECRET_KEY is not set: generated an ephemeral key for this process. "
        "All sessions will be invalidated on restart. Set SECRET_KEY in backend/.env."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_secret_key()

    await connect_to_mongo()

    try:
        logger.info("Initialising RAG engine over the bundled knowledge base...")
        rag_engine.init_engine()
        logger.info("RAG engine ready: %s", rag_engine.status())
    except Exception as exc:
        logger.error("RAG initialisation failed: %s", exc)

    yield

    await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="MediSense AI - AI-Powered Medical Report Analysis & Chat Assistant",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(reports_router, prefix=f"{settings.API_V1_STR}/reports", tags=["Reports"])
app.include_router(chat_router, prefix=f"{settings.API_V1_STR}/chat", tags=["Chat Assistant"])
app.include_router(notifications_router, prefix=f"{settings.API_V1_STR}/notifications", tags=["Notifications"])
app.include_router(admin_router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin Module"])
app.include_router(system_router, prefix=f"{settings.API_V1_STR}/system", tags=["System Status"])
app.include_router(vitals_router, prefix=f"{settings.API_V1_STR}/vitals", tags=["Health Vitals"])


@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "api_docs": "/docs",
        "system_status": f"{settings.API_V1_STR}/system/status",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
