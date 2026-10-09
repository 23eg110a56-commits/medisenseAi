"""001_initial_schema

Initial PostgreSQL relational schema for MediSense AI:
- users
- reports
- chats
- notifications
- shared_links
- otps

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-09 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), server_default='user', nullable=False),
        sa.Column('language', sa.String(length=10), server_default='en', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_verified', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_demo', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('age', sa.Integer(), nullable=True),
        sa.Column('gender', sa.String(length=50), nullable=True),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.Column('height', sa.Float(), nullable=True),
        sa.Column('systolic_bp', sa.Integer(), nullable=True),
        sa.Column('diastolic_bp', sa.Integer(), nullable=True),
        sa.Column('fasting_sugar', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 2. reports table
    op.create_table(
        'reports',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('patient_name', sa.String(length=255), server_default='', nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('gridfs_id', sa.String(length=255), nullable=True),
        sa.Column('file_size', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('extracted_text', sa.Text(), server_default='', nullable=False),
        sa.Column('extraction_engine', sa.String(length=100), nullable=True),
        sa.Column('page_count', sa.Integer(), server_default='1', nullable=True),
        sa.Column('extraction_warnings', sa.JSON(), nullable=False),
        sa.Column('analysis_status', sa.String(length=50), server_default='awaiting_review', nullable=False),
        sa.Column('analysis_mode', sa.String(length=50), nullable=True),
        sa.Column('report_type', sa.String(length=100), server_default='Unclassified laboratory report', nullable=False),
        sa.Column('summary', sa.Text(), server_default='', nullable=False),
        sa.Column('biomarkers', sa.JSON(), nullable=False),
        sa.Column('health_concerns', sa.JSON(), nullable=False),
        sa.Column('recommendations', sa.JSON(), nullable=False),
        sa.Column('health_score', sa.Integer(), nullable=True),
        sa.Column('health_score_basis', sa.Text(), nullable=True),
        sa.Column('warnings', sa.JSON(), nullable=False),
        sa.Column('unparsed_lines', sa.JSON(), nullable=False),
        sa.Column('requires_manual_review', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('language', sa.String(length=10), server_default='en', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('analyzed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('text_corrected_by_user', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_demo', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('grounding', sa.Text(), nullable=True),
        sa.Column('llm_notice', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reports_user_id', 'reports', ['user_id'], unique=False)
    op.create_index('ix_reports_analysis_status', 'reports', ['analysis_status'], unique=False)
    op.create_index('ix_reports_created_at', 'reports', ['created_at'], unique=False)

    # 3. chats table
    op.create_table(
        'chats',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('report_id', sa.String(length=36), nullable=False),
        sa.Column('messages', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['report_id'], ['reports.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_chats_user_id', 'chats', ['user_id'], unique=False)
    op.create_index('ix_chats_report_id', 'chats', ['report_id'], unique=False)

    # 4. notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('type', sa.String(length=50), server_default='info', nullable=False),
        sa.Column('read', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_demo', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'], unique=False)

    # 5. shared_links table
    op.create_table(
        'shared_links',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('report_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_in_hours', sa.Integer(), server_default='24', nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['report_id'], ['reports.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_shared_links_token', 'shared_links', ['token'], unique=True)
    op.create_index('ix_shared_links_user_id', 'shared_links', ['user_id'], unique=False)
    op.create_index('ix_shared_links_report_id', 'shared_links', ['report_id'], unique=False)

    # 6. otps table
    op.create_table(
        'otps',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('otp', sa.String(length=10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_otps_email', 'otps', ['email'], unique=False)


def downgrade() -> None:
    op.drop_table('otps')
    op.drop_table('shared_links')
    op.drop_table('notifications')
    op.drop_table('chats')
    op.drop_table('reports')
    op.drop_table('users')
