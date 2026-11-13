"""Обложка книги отдельно от страниц: фото на лицевой стороне и надпись названия.

Revision ID: e7b4c2d9a1f3
Revises: d5f1a9c3e7b2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e7b4c2d9a1f3"
down_revision: Union[str, Sequence[str], None] = "d5f1a9c3e7b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("cover", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "cover")
