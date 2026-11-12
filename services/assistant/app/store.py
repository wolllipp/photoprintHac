"""Данные «Фотопринта». В демо читаем ту же синтетику, что и макет design/insight (data/demo.json,
выгружена из insight.js). В продукте: SQL-витрины в контуре компании, ассистент под ролью только на чтение."""
from __future__ import annotations

from datetime import date, timedelta

from .connectors import load_data

D = load_data()
COLS = D["columns"]
ROWS = [dict(zip(COLS, r)) for r in D["production"]]
CLIENTS, HR = D["clients"], D["hr"]
R = D["rules"]
LAST = D["meta"]["lastWeek"]
BASE_W, CUR_W = tuple(R["baseline"]), tuple(R["current"])
FIRST = date.fromisoformat(D["meta"]["firstWeekStart"])
DIMS = {"line": "Линия", "product": "Продукт", "shift": "Смена", "operator": "Оператор",
        "supplier": "Поставщик и партия", "week": "Неделя"}


def week_start(w: int) -> date:
    return FIRST + timedelta(days=(w - 1) * 7)


def week_label(w: int) -> str:
    s = week_start(w)
    return f"{s:%d.%m}"


def inw(rows, a, b):
    return [r for r in rows if a <= r["w"] <= b]


def ssum(rows, k):
    return sum(r[k] for r in rows)


def rate(rows):
    s = ssum(rows, "sheets")
    return ssum(rows, "defects") / s if s else 0.0


def add_week_labels():
    for r in ROWS:
        r["week"] = week_label(r["w"])


def where(rows, **flt):
    return [r for r in rows if all(r.get(k) == v for k, v in flt.items() if v)]


def margin(rows):
    v = ssum(rows, "revenue")
    return (v - ssum(rows, "cost")) / v if v else 0.0


def discount_share(rows):
    d = ssum(rows, "discount")
    t = d + ssum(rows, "revenue")
    return d / t if t else 0.0


add_week_labels()


def kpis(a: int, b: int, role: str) -> dict:
    """Те же формулы, что в KPI макета. Кадровые показатели только руководителю."""
    r = inw(ROWS, a, b)
    o = ssum(r, "orders")
    out = {
        "Выручка, руб.": round(ssum(r, "revenue")),
        "Валовая маржа, %": round(margin(r) * 100, 1),
        "Средняя скидка, %": round(discount_share(r) * 100, 1),
        "Заказы": o,
        "Средний чек, руб.": round(ssum(r, "revenue") / o, 1) if o else 0,
        "Доля брака, %": round(rate(r) * 100, 2),
        "Простой оборудования, ч": round(ssum(r, "downtime"), 1),
        "Заказы в срок, %": round((1 - ssum(r, "late") / o) * 100, 1) if o else 0,
        "Претензии по браку": ssum(inw(CLIENTS, a, b), "claims"),
    }
    if role == "ceo":
        h = inw(HR, a, b)
        out["Укомплектованность смен, %"] = round(100 * ssum(h, "staffed") / ssum(h, "planned"), 1)
        out["Переработка, ч"] = ssum(h, "overtime")
        out["Фонд оплаты, % выручки"] = round(100 * ssum(h, "payroll") / ssum(r, "revenue"), 1)
    return out
