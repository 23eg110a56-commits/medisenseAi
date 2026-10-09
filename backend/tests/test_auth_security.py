"""Tests for credential handling, token integrity and secret hygiene."""

import asyncio
import re
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException
from jose import jwt

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    get_current_token_payload,
    get_password_hash,
    verify_password,
)
from app.config import settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _decode(token: str):
    return asyncio.run(get_current_token_payload(token))


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------

def test_password_hash_does_not_contain_the_plaintext():
    hashed = get_password_hash("correct horse battery staple")
    assert "correct horse battery staple" not in hashed
    assert hashed != "correct horse battery staple"


def test_password_verification_round_trip():
    hashed = get_password_hash("s3cret-passw0rd")
    assert verify_password("s3cret-passw0rd", hashed) is True
    assert verify_password("s3cret-passw0rd2", hashed) is False


def test_the_same_password_hashes_differently_each_time():
    """A per-hash salt means a leaked store does not reveal shared passwords."""
    assert get_password_hash("same-password") != get_password_hash("same-password")


def test_bcrypt_hash_shape():
    assert get_password_hash("x" * 20).startswith("$2")


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------

def test_access_token_carries_subject_and_role():
    payload = _decode(create_access_token("user-123", role="user"))
    assert payload.sub == "user-123"
    assert payload.role == "user"


def test_refresh_token_is_distinct_from_access_token():
    assert create_access_token("u") != create_refresh_token("u")


def test_expired_token_is_rejected():
    token = create_access_token("user-123", expires_delta=timedelta(minutes=-5))
    with pytest.raises(HTTPException) as exc:
        _decode(token)
    assert exc.value.status_code == 401


def test_tampered_signature_is_rejected():
    token = create_access_token("user-123")
    header, payload, signature = token.split(".")
    flipped = ("A" if signature[0] != "A" else "B") + signature[1:]
    with pytest.raises(HTTPException) as exc:
        _decode(f"{header}.{payload}.{flipped}")
    assert exc.value.status_code == 401


def test_payload_swapped_after_signing_is_rejected():
    """Re-using a valid signature over a different subject must not authenticate."""
    header, _, signature = create_access_token("user-123").split(".")
    forged_payload = jwt.encode(
        {"sub": "admin-1", "role": "admin", "exp": 9_999_999_999},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    ).split(".")[1]
    with pytest.raises(HTTPException) as exc:
        _decode(f"{header}.{forged_payload}.{signature}")
    assert exc.value.status_code == 401


def test_token_signed_with_another_key_is_rejected():
    forged = jwt.encode(
        {"sub": "user-123", "role": "user", "exp": 9_999_999_999},
        "a-completely-different-secret",
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc:
        _decode(forged)
    assert exc.value.status_code == 401


def test_malformed_token_is_rejected():
    with pytest.raises(HTTPException) as exc:
        _decode("not.a.jwt")
    assert exc.value.status_code == 401


# --------------------------------------------------------------------------
# Signing key configuration
# --------------------------------------------------------------------------

def test_missing_secret_key_generates_an_ephemeral_one(monkeypatch):
    from app.main import _ensure_secret_key

    monkeypatch.setattr(settings, "SECRET_KEY", "", raising=False)
    _ensure_secret_key()
    generated = settings.SECRET_KEY
    assert len(generated) >= 32
    # Two runs must not collide, otherwise sessions are forgeable across restarts.
    monkeypatch.setattr(settings, "SECRET_KEY", "", raising=False)
    _ensure_secret_key()
    assert settings.SECRET_KEY != generated


def test_explicit_secret_key_is_preserved(monkeypatch):
    from app.main import _ensure_secret_key

    monkeypatch.setattr(settings, "SECRET_KEY", "configured-by-operator", raising=False)
    _ensure_secret_key()
    assert settings.SECRET_KEY == "configured-by-operator"


def test_config_ships_without_a_hardcoded_signing_key():
    defaults = type(settings).model_fields
    assert defaults["SECRET_KEY"].default == ""
    assert defaults["GEMINI_API_KEY"].default == ""
    assert defaults["ADMIN_PASSWORD"].default == ""


# --------------------------------------------------------------------------
# Secret hygiene across the source tree
# --------------------------------------------------------------------------

_SOURCE_GLOBS = ("app/**/*.py",)
_SKIP_DIRS = {"__pycache__", ".venv", "data"}

# A real credential looks like a long opaque token, not a variable name or a
# placeholder, so require length and the absence of obvious placeholder words.
_CREDENTIAL_SHAPES = [
    re.compile(r"""["'](?:sk|pk|AIza|xox[baprs]|ghp_|ya29)[A-Za-z0-9_\-]{16,}["']"""),
    re.compile(r"""["'][A-Za-z0-9+/]{40,}={0,2}["']"""),
]
_PLACEHOLDER_HINTS = ("your-", "your_", "xxx", "changeme", "placeholder", "<", "example", "...")


def _python_sources():
    for pattern in _SOURCE_GLOBS:
        for path in BACKEND_ROOT.glob(pattern):
            if not any(part in _SKIP_DIRS for part in path.parts):
                yield path


def test_no_credential_shaped_literals_in_backend_source():
    offenders = []
    for path in _python_sources():
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("#"):
                continue
            for shape in _CREDENTIAL_SHAPES:
                for match in shape.findall(line):
                    if not any(hint in match.lower() for hint in _PLACEHOLDER_HINTS):
                        offenders.append(f"{path.relative_to(BACKEND_ROOT)}:{lineno}")
    assert not offenders, f"possible hardcoded credential at {offenders}"


def test_env_example_contains_placeholders_only():
    example = BACKEND_ROOT / ".env.example"
    assert example.exists(), "backend/.env.example is required by the brief"
    for lineno, line in enumerate(example.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() in {"SECRET_KEY", "GEMINI_API_KEY", "ADMIN_PASSWORD", "MONGODB_URL"}:
            assert not re.search(r"[A-Za-z0-9+/]{32,}", value), (
                f".env.example:{lineno} looks like it holds a real credential"
            )


def test_real_env_file_is_not_packaged_into_the_repository():
    """A live .env may exist locally, but it must be ignored by version control."""
    gitignore = BACKEND_ROOT.parent / ".gitignore"
    if gitignore.exists():
        assert ".env" in gitignore.read_text(encoding="utf-8")
