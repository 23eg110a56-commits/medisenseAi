import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, BeforeValidator
from typing import Annotated, Any

def parse_cors(v: Any) -> List[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, (list, str)):
        return v
    raise ValueError(v)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "MediSense AI"
    API_V1_STR: str = "/api/v1"
    # No default: a missing key generates an ephemeral one at startup (see app.main)
    # so that a forgotten configuration can never silently sign tokens with a
    # value that is public in this repository.
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "medisense_ai"
    POSTGRES_URL: str = ""
    DATABASE_URL: str = ""
    GEMINI_API_KEY: str = ""
    # Model identifier used when a key is present. Empty falls back to the
    # default in app.services.gemini_service.
    GEMINI_MODEL: str = ""
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Upload limits
    MAX_UPLOAD_SIZE_MB: int = 10

    # Auth configuration
    ALGORITHM: str = "HS256"

    # Optional administrator bootstrap. Leave ADMIN_PASSWORD unset to skip seeding
    # an admin account; never commit a real password.
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    # When true, password-reset codes are returned in the API response instead of
    # being emailed. Local development only — it bypasses email verification.
    EXPOSE_DEV_OTP: bool = False

    # CORS Origins (comma separated list in env or list in code)
    BACKEND_CORS_ORIGINS: Annotated[
        List[str], BeforeValidator(parse_cors)
    ] = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"]

settings = Settings()
