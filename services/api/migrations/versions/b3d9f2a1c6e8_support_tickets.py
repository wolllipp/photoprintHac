"""Обращения в поддержку по заказу.

Revision ID: b3d9f2a1c6e8
Revises: a7c3e1f0b2d4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b3d9f2a1c6e8"
down_revision: Union[str, Sequence[str], None] = "a7c3e1f0b2d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("number", sa.Integer(), sa.Identity(start=10001), nullable=False, unique=True),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("orders.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("topic", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("support_tickets")
