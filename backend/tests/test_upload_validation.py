"""Tests for upload validation and the safety of stored file handling."""

import pytest
from fastapi import HTTPException

from app.config import settings
from app.routes.reports import (
    MAX_FILE_BYTES,
    _extension,
    _format_date,
    _sortable_date,
    serialize_doc,
    validate_upload,
)


@pytest.mark.parametrize("filename", ["report.pdf", "scan.PNG", "photo.jpeg", "x.jpg"])
def test_supported_types_are_accepted(filename):
    validate_upload(filename, "application/pdf", 1024)


@pytest.mark.parametrize(
    "filename",
    ["notes.txt", "payload.exe", "archive.zip", "report.pdf.exe", "noextension", "", None],
)
def test_unsupported_types_are_rejected_with_415(filename):
    with pytest.raises(HTTPException) as exc:
        validate_upload(filename, "application/octet-stream", 1024)
    assert exc.value.status_code == 415
    assert "not a supported file type" in exc.value.detail


def test_double_extension_cannot_smuggle_an_executable_past_the_check():
    """Windows treats "report.pdf.exe" as an executable; the extension check must too."""
    assert _extension("report.pdf.exe") == "exe"
    with pytest.raises(HTTPException) as exc:
        validate_upload("report.pdf.exe", "application/pdf", 1024)
    assert exc.value.status_code == 415


def test_mismatched_content_type_is_rejected():
    with pytest.raises(HTTPException) as exc:
        validate_upload("report.pdf", "text/html", 1024)
    assert exc.value.status_code == 415
    assert "does not match a report file" in exc.value.detail


def test_empty_file_is_rejected_with_400():
    with pytest.raises(HTTPException) as exc:
        validate_upload("report.pdf", "application/pdf", 0)
    assert exc.value.status_code == 400
    assert "is empty" in exc.value.detail


def test_oversized_file_is_rejected_with_413_and_states_the_limit():
    with pytest.raises(HTTPException) as exc:
        validate_upload("report.pdf", "application/pdf", MAX_FILE_BYTES + 1)
    assert exc.value.status_code == 413
    assert f"{settings.MAX_UPLOAD_SIZE_MB} MB limit" in exc.value.detail


def test_file_exactly_at_the_limit_is_accepted():
    validate_upload("report.pdf", "application/pdf", MAX_FILE_BYTES)


def test_limit_is_derived_from_configuration():
    assert MAX_FILE_BYTES == settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def test_serialize_doc_renames_mongo_id():
    assert serialize_doc({"_id": "abc", "filename": "r.pdf"}) == {"id": "abc", "filename": "r.pdf"}
    assert serialize_doc(None) is None


def test_serialize_doc_does_not_expose_the_storage_id_under_its_original_key():
    doc = serialize_doc({"_id": "abc"})
    assert "_id" not in doc


def test_format_date_renders_iso_and_datetime_consistently():
    from datetime import datetime

    assert _format_date(datetime(2026, 10, 9)) == "Oct 09, 2026"
    assert _format_date("2026-10-09T14:30:00Z") == "Oct 09, 2026"


def test_sortable_date_tolerates_missing_and_malformed_values():
    assert _sortable_date(None) == 0.0
    assert _sortable_date("not a date") == 0.0
    assert _sortable_date("2026-10-09T00:00:00Z") > _sortable_date("2026-10-08T00:00:00Z")
