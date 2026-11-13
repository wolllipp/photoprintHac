"""Оформление книги из вопросов перед сборкой: какие фото, их размер, фон, украшения.

Revision ID: f2a6d8c4b9e1
Revises: e7b4c2d9a1f3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f2a6d8c4b9e1"
down_revision: Union[str, Sequence[str], None] = "e7b4c2d9a1f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("style", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "style")
