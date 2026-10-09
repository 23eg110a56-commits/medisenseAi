-- =============================================================================
-- MediSense AI - PostgreSQL Production Database Schema
-- Production Relational Schema with Constraints, Indices & Cascade Rules
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. USERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    age INTEGER NULL,
    gender VARCHAR(50) NULL,
    weight DOUBLE PRECISION NULL,
    height DOUBLE PRECISION NULL,
    systolic_bp INTEGER NULL,
    diastolic_bp INTEGER NULL,
    fasting_sugar DOUBLE PRECISION NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- -----------------------------------------------------------------------------
-- 2. MEDICAL REPORTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL DEFAULT '',
    filename VARCHAR(255) NOT NULL,
    gridfs_id VARCHAR(255) NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    extracted_text TEXT NOT NULL DEFAULT '',
    extraction_engine VARCHAR(100) NULL,
    page_count INTEGER DEFAULT 1,
    extraction_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    analysis_status VARCHAR(50) NOT NULL DEFAULT 'awaiting_review',
    analysis_mode VARCHAR(50) NULL,
    report_type VARCHAR(100) NOT NULL DEFAULT 'Unclassified laboratory report',
    summary TEXT NOT NULL DEFAULT '',
    biomarkers JSONB NOT NULL DEFAULT '[]'::jsonb,
    health_concerns JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommendations JSONB NOT NULL DEFAULT '{}'::jsonb,
    health_score INTEGER NULL,
    health_score_basis TEXT NULL,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    unparsed_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    requires_manual_review BOOLEAN NOT NULL DEFAULT TRUE,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    analyzed_at TIMESTAMP WITH TIME ZONE NULL,
    text_corrected_by_user BOOLEAN NOT NULL DEFAULT FALSE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    grounding TEXT NULL,
    llm_notice TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(analysis_status);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);

-- -----------------------------------------------------------------------------
-- 3. CLINICAL CONVERSATIONS (CHAT)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_id VARCHAR(36) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_user_report ON chats(user_id, report_id);

-- -----------------------------------------------------------------------------
-- 4. NOTIFICATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. SECURE TIME-LIMITED SHARING LINKS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shared_links (
    id VARCHAR(36) PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    report_id VARCHAR(36) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_in_hours INTEGER NOT NULL DEFAULT 24
);

CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token);

-- -----------------------------------------------------------------------------
-- 6. ONE-TIME PASSWORDS (OTP)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otps (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
