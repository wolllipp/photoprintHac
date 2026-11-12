"""Позиции заказа фотопечати: какое фото и в каком формате.

Revision ID: a7c3e1f0b2d4
Revises: cc1dad9bc6f6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a7c3e1f0b2d4"
down_revision: Union[str, Sequence[str], None] = "cc1dad9bc6f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("photo_id", sa.Uuid(), sa.ForeignKey("photos.id"), nullable=True))
    op.add_column("order_items", sa.Column("option_id", sa.Uuid(), sa.ForeignKey("product_options.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "option_id")
    op.drop_column("order_items", "photo_id")
