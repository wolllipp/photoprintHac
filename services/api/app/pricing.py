import math
from datetime import date, timedelta
from decimal import Decimal

from app.models import DeliveryMethod, ProductOption


class PricingError(ValueError):
    pass


def book_price(opt: ProductOption, pages: int) -> Decimal:
    """Цена книги: base_price за base_pages, дальше step_price за каждый шаг (1 разворот = 2 стр.)."""
    if pages % 2:
        pages += 1
    if opt.min_pages and pages < opt.min_pages:
        raise PricingError(f"минимум {opt.min_pages} стр.")
    if opt.max_pages and pages > opt.max_pages:
        raise PricingError(f"максимум {opt.max_pages} стр.")
    extra = max(0, pages - opt.base_pages)
    steps = math.ceil(extra / opt.step_pages) if extra else 0
    return (opt.base_price + steps * opt.step_price).quantize(Decimal("0.01"))


def add_business_days(start: date, days: int) -> date:
    d = start
    while days > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            days -= 1
    return d


def eta(opt: ProductOption, delivery: DeliveryMethod, today: date | None = None) -> date:
    return add_business_days(today or date.today(), opt.production_days + delivery.days)


def delivery_cost(delivery: DeliveryMethod, items_total: Decimal) -> Decimal:
    if delivery.free_from is not None and items_total >= delivery.free_from:
        return Decimal("0.00")
    return delivery.price
