"""Журнал действий (ОТ-04).

Revision ID: d5f1a9c3e7b2
Revises: c4e8a2b7d913
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d5f1a9c3e7b2"
down_revision: Union[str, Sequence[str], None] = "c4e8a2b7d913"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("role", sa.String(20), nullable=True),
        sa.Column("action", sa.String(60), nullable=False, index=True),
        sa.Column("object_type", sa.String(30), nullable=True),
        sa.Column("object_id", sa.String(64), nullable=True),
        sa.Column("status", sa.Integer(), nullable=False),
        sa.Column("result", sa.String(10), nullable=False),
        sa.Column("ip", sa.String(45), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
