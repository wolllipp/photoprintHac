"""Поиск по регламентам. В продукте: эмбеддинги bge-m3 + pgvector и права на документ; здесь поиск по словам."""
from __future__ import annotations

import re
from pathlib import Path

from ..registry import Result, tool

DOCS = [
    dict(id="REG-12", title="Регламент калибровки Ricoh", text="Калибровка Ricoh проводится перед началом каждой смены. Ночная смена калибрует линию по контрольной мишени; отклонение ΔE больше 3 — остановка линии и вызов наладчика. Новые операторы первые две недели работают с наставником."),
    dict(id="QA-03", title="Нормы брака", text="Допустимый брак фотокниг не более 2% за смену, фотопечати не более 1%. При превышении две смены подряд создаётся отклонение и назначается владелец."),
    dict(id="FIN-07", title="Политика скидок", text="Купоны действуют только на первый заказ. Суммарная скидка с учётом пиковых периодов не более 30%. Скидка на Premium выше 25% требует согласования директора."),
    dict(id="HR-02", title="Сезонный найм", text="Вакансии на сезон (1 апреля — 1 июля) открываются не позже чем за 8 недель до начала. Обучение временного сотрудника 3 дня."),
    dict(id="CLM-01", title="Претензии по браку", text="Подтверждённый дефект печати — бесплатная перепечатка без возврата книги. Достаточно фото дефекта. Срок перепечатки 3–5 рабочих дней."),
]
GUIDES = [dict(id=f.stem, title=(f.read_text(encoding="utf-8").splitlines() or [f.stem])[0].lstrip("# "), text=f.read_text(encoding="utf-8"), full=True)
          for f in sorted((Path(__file__).resolve().parents[2] / "docs").glob("*.md"))]
_w = lambda s: {x[:5] for x in re.findall(r"[а-яёa-z0-9]{4,}", s.lower())}


@tool("search_docs", "knowledge", "Ищу в документах", "Поиск по регламентам компании и по описанию системы Insight и самого ассистента (что умеет, как устроен, роли, показатели), а также по руководству по сборке файлов. Возвращает цитату или документ целиком.",
      {"query": {"type": "string"}}, required=["query"], keywords=("регламент", "политик", "норма", "правил", "как положено", "допустим", "систем", "ассистент", "insight", "инсайт", "ты умеешь", "что умеешь", "руководств"))
def search_docs(ctx, query):
    q = _w(query)
    hits = sorted(((len(q & _w(d["title"] + " " + d["text"])), d) for d in DOCS + GUIDES), key=lambda x: -x[0])
    hits = [d for s, d in hits if s > 0][:2]
    return Result(data=dict(found=[dict(id=d["id"], title=d["title"], quote=d["text"][:5000]) for d in hits] or "ничего не найдено", summary=f"документов: {len(hits)}"),
                  sources=[dict(name=d["title"], kind="документ", detail=d["text"][:80].replace("\n", " ")) for d in hits if not d.get("full")] or
                          [dict(name=d["title"], kind="описание системы", detail="") for d in hits])
