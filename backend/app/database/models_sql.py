"""SQLAlchemy relational models for PostgreSQL database migrations."""

from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    BigInteger,
    func,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def generate_uuid() -> str:
    return str(uuid.uuid4())


class UserSQL(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(50), default="user", nullable=False)
    language = Column(String(10), default="en", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(50), nullable=True)
    weight = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    systolic_bp = Column(Integer, nullable=True)
    diastolic_bp = Column(Integer, nullable=True)
    fasting_sugar = Column(Float, nullable=True)

    # Relationships
    reports = relationship("ReportSQL", back_populates="user", cascade="all, delete-orphan")
    chats = relationship("ChatSQL", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("NotificationSQL", back_populates="user", cascade="all, delete-orphan")
    shared_links = relationship("SharedLinkSQL", back_populates="user", cascade="all, delete-orphan")


class ReportSQL(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_name = Column(String(255), default="", nullable=False)
    filename = Column(String(255), nullable=False)
    gridfs_id = Column(String(255), nullable=True)
    file_size = Column(BigInteger, default=0, nullable=False)
    extracted_text = Column(Text, default="", nullable=False)
    extraction_engine = Column(String(100), nullable=True)
    page_count = Column(Integer, default=1, nullable=True)
    extraction_warnings = Column(JSON, default=list, nullable=False)
    analysis_status = Column(String(50), default="awaiting_review", nullable=False, index=True)
    analysis_mode = Column(String(50), nullable=True)
    report_type = Column(String(100), default="Unclassified laboratory report", nullable=False)
    summary = Column(Text, default="", nullable=False)
    biomarkers = Column(JSON, default=list, nullable=False)
    health_concerns = Column(JSON, default=dict, nullable=False)
    recommendations = Column(JSON, default=dict, nullable=False)
    health_score = Column(Integer, nullable=True)
    health_score_basis = Column(Text, nullable=True)
    warnings = Column(JSON, default=list, nullable=False)
    unparsed_lines = Column(JSON, default=list, nullable=False)
    requires_manual_review = Column(Boolean, default=True, nullable=False)
    language = Column(String(10), default="en", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)
    text_corrected_by_user = Column(Boolean, default=False, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    grounding = Column(Text, nullable=True)
    llm_notice = Column(Text, nullable=True)

    # Relationships
    user = relationship("UserSQL", back_populates="reports")
    chats = relationship("ChatSQL", back_populates="report", cascade="all, delete-orphan")
    shared_links = relationship("SharedLinkSQL", back_populates="report", cascade="all, delete-orphan")


class ChatSQL(Base):
    __tablename__ = "chats"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    report_id = Column(String(36), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    messages = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("UserSQL", back_populates="chats")
    report = relationship("ReportSQL", back_populates="chats")


class NotificationSQL(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info", nullable=False)
    read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)

    user = relationship("UserSQL", back_populates="notifications")


class SharedLinkSQL(Base):
    __tablename__ = "shared_links"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    token = Column(String(255), unique=True, nullable=False, index=True)
    report_id = Column(String(36), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_in_hours = Column(Integer, default=24, nullable=False)

    user = relationship("UserSQL", back_populates="shared_links")
    report = relationship("ReportSQL", back_populates="shared_links")


class OTPSQL(Base):
    __tablename__ = "otps"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), nullable=False, index=True)
    otp = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
