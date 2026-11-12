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
from app.models import Order, OrderItem, Product, Project, SupportTicket

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


# Снимок дашборда Ильи (notes/26-insight-data-contract.md): та же форма, что design/insight/data/synthetic.js
SNAPSHOT = Path(__file__).resolve().parents[4] / "design" / "insight" / "data" / "synthetic.js"
PRODUCT_INDEX = {"lite": 0, "classic": 1, "premium": 2, "print_chemical": 3, "print_digital": 4}
# линия печати продукта — как в каталоге (seed.py): книги Lite/Classic и цифровая печать — Ricoh, Premium — Noritsu, фотохимия — Fuji
LINE_INDEX = {"lite": 0, "classic": 0, "premium": 2, "print_chemical": 1, "print_digital": 0}
TOPIC_INDEX = {"delay": 0, "defect": 1, "delivery": 3, "layout": 4, "other": 6}
SHIPPED = {"handed_to_delivery", "ready_for_pickup", "delivered"}
NOT_YET = 9999  # «ещё не отгружен»: дашборд считает отгрузку как ship_day <= последний день периода


def _snapshot() -> dict:
    text = SNAPSHOT.read_text(encoding="utf-8")
    return json.loads(text[text.index("window.INSIGHT_DATA =") + len("window.INSIGHT_DATA ="):].strip().rstrip(";"))


@router.get("/insight/snapshot")
async def insight_snapshot(s: AsyncSession = Depends(get_session)):
    """Снимок для дашборда Insight: синтетическая история компании + живые заказы, оплаты и обращения из приложения.

    Живые события кладём на последний день снимка (он заканчивается раньше сегодняшнего дня), канал — «Приложение».
    Дашборд читает снимок через свой слой InsightData — экраны не меняются (контракт Ильи, notes/26).
    """
    snap = _snapshot()
    day = max(r[snap["orders"]["cols"].index("day")] for r in snap["orders"]["rows"])
    channel_app = snap["dicts"]["channels"].index("Приложение")
    tch = snap["dicts"].setdefault("ticketChannels", [])
    if "Приложение" not in tch:
        tch.append("Приложение")
    t_app = tch.index("Приложение")
    orders = (await s.execute(select(Order).order_by(Order.created_at))).scalars().all()
    kinds = dict((await s.execute(select(OrderItem.order_id, Product.code).join(Product, Product.id == OrderItem.product_id)
                                  .where(OrderItem.order_id.in_([o.id for o in orders]) if orders else False))).all())
    seen_customers = set()
    for o in orders:
        code = kinds.get(o.id) or "print_chemical"
        hour = (o.created_at.hour + 3) % 24
        total = float(o.total)
        cust = f"APP-{str(o.user_id)[:8]}"
        if cust not in seen_customers:
            seen_customers.add(cust)
            snap["customers"]["rows"].append([cust, day, channel_app, 0])
        shipped = o.stage.value in SHIPPED
        promise = day + max(0, (o.promised_at.date() - o.created_at.date()).days) if o.promised_at else day + 3
        snap["orders"]["rows"].append([f"APP-{o.number}", cust, day, hour, PRODUCT_INDEX.get(code, 3), LINE_INDEX.get(code, 1),
                                       0 if 8 <= hour < 20 else 1, 1, total, 0, round(total * 0.45, 2), channel_app, 0,
                                       promise, day if shipped else NOT_YET, hour if shipped else 0, 15, 0])
        snap["payments"]["rows"].append([f"APP-{o.number}", day, round(total / 1.2, 2), 0, round(total * 0.45 / 1.2, 2)])
    tickets = (await s.execute(select(SupportTicket, Order.number, Order.user_id).join(Order, Order.id == SupportTicket.order_id)
                               .order_by(SupportTicket.created_at))).all()
    now = datetime.now(timezone.utc)
    for t, number, user_id in tickets:
        age = max(1, int((now - t.created_at).total_seconds() // 60))
        snap["tickets"]["rows"].append([f"APP-T{t.number}", f"APP-{str(user_id)[:8]}", f"APP-{number}", day,
                                        (t.created_at.hour + 3) % 24, TOPIC_INDEX.get(t.topic, 6), t_app, 240,
                                        age if t.status == "open" else 60])
    # приложение: начатые проекты и заказы за день — живые добавляем к последнему дню
    app = snap["app"]
    last = next((r for r in app["rows"] if r[0] == day), None)
    if last is None:
        last = [day, 0, 0]
        app["rows"].append(last)
    started = (await s.execute(select(func.count()).select_from(Project))).scalar_one()
    last[1] += started
    last[2] += len(orders)
    snap["meta"]["live"] = {"orders": len(orders), "tickets": len(tickets), "updated_at": now.isoformat(timespec="seconds"),
                            "source": "picPac API: заказы и обращения из приложения клиента"}
    return snap
