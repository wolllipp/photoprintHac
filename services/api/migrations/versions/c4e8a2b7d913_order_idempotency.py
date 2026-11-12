"""Ключ повтора заказа (Idempotency-Key): повтор того же запроса не создаёт второй заказ.

Revision ID: c4e8a2b7d913
Revises: b3d9f2a1c6e8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c4e8a2b7d913"
down_revision: Union[str, Sequence[str], None] = "b3d9f2a1c6e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("idempotency_key", sa.String(64), nullable=True))
    op.add_column("orders", sa.Column("idempotency_hash", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_orders_user_idempotency", "orders", ["user_id", "idempotency_key"])


def downgrade() -> None:
    op.drop_constraint("uq_orders_user_idempotency", "orders", type_="unique")
    op.drop_column("orders", "idempotency_hash")
    op.drop_column("orders", "idempotency_key")
