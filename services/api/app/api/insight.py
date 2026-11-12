"""Общие данные для Insight (трек 1) и ассистента (трек 3): демо-история компании + живые события из приложения.

GET /insight/data — формат data/demo.json ассистента (его же читает дашборд), плюс блок `live`:
заказы из приложения (этапы, суммы, тариф), обращения в поддержку по заказам, время актуальности.
Персональных данных нет: только номера заказов, суммы и темы обращений.
Ассистент: ASSISTANT_DATA_URL=http://localhost:8000/insight/data.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Order, OrderItem, Product, SupportTicket

router = APIRouter(tags=["insight"])
DEMO = Path(__file__).resolve().parents[3] / "assistant" / "data" / "demo.json"


async def live(s: AsyncSession) -> dict:
    orders = (await s.execute(select(Order).order_by(Order.created_at.desc()).limit(50))).scalars().all()
    kinds = dict((await s.execute(select(OrderItem.order_id, Product.code)
                                  .join(Product, Product.id == OrderItem.product_id)
                                  .where(OrderItem.order_id.in_([o.id for o in orders]) if orders else False))).all())
    by_stage = dict((await s.execute(select(Order.stage, func.count()).group_by(Order.stage))).all())
    tickets = (await s.execute(select(SupportTicket, Order.number).join(Order, Order.id == SupportTicket.order_id)
                               .order_by(SupportTicket.created_at.desc()).limit(50))).all()
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "picPac API (приложение клиента), таблицы orders и support_tickets",
        "orders_total": sum(by_stage.values()),
        "orders_by_stage": {k.value: v for k, v in by_stage.items()},
        "orders": [{"number": o.number, "product": kinds.get(o.id), "total": str(o.total), "stage": o.stage.value,
                    "created_at": o.created_at.isoformat(timespec="seconds")} for o in orders],
        "support_open": sum(1 for t, _ in tickets if t.status == "open"),
        "support": [{"number": t.number, "order_number": n, "topic": t.topic, "status": t.status,
                     "created_at": t.created_at.isoformat(timespec="seconds")} for t, n in tickets],
    }


@router.get("/insight/data")
async def insight_data(s: AsyncSession = Depends(get_session)):
    # кодировка явно: на Windows по умолчанию cp1251, и русские данные компании давали 500
    data = json.loads(DEMO.read_text(encoding="utf-8")) if DEMO.exists() else {}
    data["live"] = await live(s)
    return data
