"""Аналитика и расчёты. Все числа считает код."""
from __future__ import annotations

import statistics
from math import sqrt

import matplotlib.pyplot as plt

from .. import store as S
from ..registry import Result, tool
from ._common import ACC, BAD, INK, MUTE, SRC, fig_to_artifact, style

LINES = {"Ricoh", "Fuji Frontier", "Noritsu"}
FIN_DENY = {"manager": False, "ceo": True}


def _week_rows(rows, w):
    return [r for r in rows if r["w"] == w]


@tool("kpi_overview", "analysis", "Сводка показателей",
      "Ключевые показатели за период (недели) и сравнение с базой: выручка, маржа, скидка, брак, простой, в срок, претензии.",
      {"line": {"type": "string", "description": "линия: Ricoh, Fuji Frontier, Noritsu; пусто = все"},
       "weeks": {"type": "integer", "description": "сколько последних недель, по умолчанию 2"}},
      keywords=("показател", "сводк", "итог", "выручк", "как дела", "kpi", "обзор"))
def kpi_overview(ctx, line="", weeks=2):
    weeks = max(1, int(weeks or 2))
    a, b = S.LAST - weeks + 1, S.LAST
    rows = S.ROWS if not line else S.where(S.ROWS, line=line)
    cur = {k: v for k, v in S.kpis(a, b, ctx["role"]).items()} if not line else None
    if line:
        r = S.inw(rows, a, b)
        cur = {"Выручка, руб.": round(S.ssum(r, "revenue")), "Доля брака, %": round(S.rate(r) * 100, 2),
               "Маржа, %": round(S.margin(r) * 100, 1), "Простой, ч": round(S.ssum(r, "downtime"), 1)}
    base = S.kpis(S.BASE_W[0], S.BASE_W[1], ctx["role"]) if not line else {}
    return Result(data=dict(period=f"недели {S.week_label(a)}–{S.week_label(b)}", now=cur, baseline_w7_14=base,
                            summary=f"сводка за {weeks} нед."),
                  sources=[SRC["defects"], SRC["finance"]] + ([SRC["hr"]] if ctx["role"] == "ceo" else []))


@tool("explain_deviation", "analysis", "Ищу причину отклонения",
      "Разложить отклонение (брак, маржа, скидка) по линии, продукту, смене, оператору, поставщику и неделе: какой разрез объясняет прирост, вклад в %, потери в рублях, совпадения по времени (простой, смена партии).",
      {"metric": {"type": "string", "enum": ["defect", "margin"], "description": "defect — брак, margin — маржа и скидки"}},
      required=["metric"], keywords=("причин", "почему", "брак", "отклонен", "упал", "вырос", "марж", "скидк"))
def explain_deviation(ctx, metric="defect"):
    base, cur = S.inw(S.ROWS, *S.BASE_W), S.inw(S.ROWS, *S.CUR_W)
    if metric == "margin":
        out = []
        for p in sorted({r["product"] for r in S.ROWS}):
            b, c = S.where(base, product=p), S.where(cur, product=p)
            out.append(dict(product=p, margin_before=round(S.margin(b) * 100, 1), margin_now=round(S.margin(c) * 100, 1),
                            discount_before=round(S.discount_share(b) * 100, 1), discount_now=round(S.discount_share(c) * 100, 1)))
        out.sort(key=lambda x: x["margin_now"] - x["margin_before"])
        w = out[0]
        return Result(data=dict(by_product=out, summary=f"сильнее всего просела маржа: {w['product']}"), sources=[SRC["finance"]])
    overall, total = S.rate(base), S.ssum(cur, "sheets")
    dims = []
    for key, label in S.DIMS.items():
        groups = {}
        for r in cur:
            groups.setdefault(r[key], []).append(r)
        vals = []
        for v, c in groups.items():
            b = [r for r in base if r[key] == v]
            br = S.rate(b) if b else overall
            ex = S.ssum(c, "defects") - S.ssum(c, "sheets") * br
            vals.append(dict(value=v, now_pct=round(S.rate(c) * 100, 2), before_pct=round(br * 100, 2), excess=ex, vol=S.ssum(c, "sheets") / total))
        pos = sum(max(0, v["excess"]) for v in vals) or 1
        for v in vals:
            v["share_of_increase_pct"] = round(100 * max(0, v["excess"]) / pos)
            v["share_of_volume_pct"] = round(100 * v["vol"])
            v["lift"] = max(0, v["excess"]) / pos - v["vol"]
        vals.sort(key=lambda v: -v["share_of_increase_pct"])
        dims.append(dict(dimension=label, lift=vals[0]["lift"], top=[{k: v[k] for k in ("value", "before_pct", "now_pct", "share_of_increase_pct", "share_of_volume_pct")} for v in vals[:3]]))
    dims.sort(key=lambda d: -d["lift"])
    for d in dims:
        d.pop("lift")
    cost_sheet = S.ssum(cur, "cost") / S.ssum(cur, "sheets")
    excess_all = S.ssum(cur, "defects") - total * overall
    ricoh = S.where(cur, line=S.R["ricoh"])
    night, day = S.where(ricoh, shift="Ночь"), S.where(ricoh, shift="День")
    down_b = S.ssum(S.where(base, line=S.R["ricoh"], shift="Ночь"), "downtime") / (S.BASE_W[1] - S.BASE_W[0] + 1)
    down_c = S.ssum(night, "downtime") / (S.CUR_W[1] - S.CUR_W[0] + 1)
    data = dict(overall_before_pct=round(overall * 100, 2), overall_now_pct=round(S.rate(cur) * 100, 2),
                best_dimension_first=dims[:3], ricoh_night_now_pct=round(S.rate(night) * 100, 2), ricoh_day_now_pct=round(S.rate(day) * 100, 2),
                ricoh_night_downtime_h_per_week_before=round(down_b, 1), ricoh_night_downtime_h_per_week_now=round(down_c, 1),
                batch_change=S.D["batchChange"], extra_defects_two_weeks=round(excess_all),
                est_loss_rub_two_weeks=round(excess_all * cost_sheet),
                caveat="Совпадение по времени не доказывает причину; вклад простоя и партии не разделён.",
                summary=f"главный разрез: {dims[0]['dimension']} = {dims[0]['top'][0]['value']}")
    return Result(data=data, sources=[SRC["defects"], dict(name="журнал простоев оборудования", kind="журнал", detail="простои Ricoh по сменам"),
                                       dict(name="накладные на материалы", kind="документ", detail="смена партии")])


@tool("compare_periods", "analysis", "Сравниваю периоды",
      "Сравнить показатель за два периода (номера недель) по линии: изменение абсолютное и в %.",
      {"metric": {"type": "string", "enum": ["defect", "revenue", "margin", "discount", "downtime", "orders"]},
       "from_a": {"type": "integer"}, "to_a": {"type": "integer"}, "from_b": {"type": "integer"}, "to_b": {"type": "integer"},
       "line": {"type": "string"}}, required=["metric", "from_a", "to_a", "from_b", "to_b"],
      keywords=("сравни", "к прошл", "динамик", "период"))
def compare_periods(ctx, metric, from_a, to_a, from_b, to_b, line=""):
    f = {"defect": lambda r: S.rate(r) * 100, "revenue": lambda r: S.ssum(r, "revenue"), "margin": lambda r: S.margin(r) * 100,
         "discount": lambda r: S.discount_share(r) * 100, "downtime": lambda r: S.ssum(r, "downtime"), "orders": lambda r: S.ssum(r, "orders")}[metric]
    rows = S.ROWS if not line else S.where(S.ROWS, line=line)
    a, b = f(S.inw(rows, from_a, to_a)), f(S.inw(rows, from_b, to_b))
    return Result(data=dict(metric=metric, period_a=round(a, 2), period_b=round(b, 2), delta=round(b - a, 2),
                            delta_pct=round(100 * (b - a) / a, 1) if a else None, summary=f"{metric}: {round(a, 2)} → {round(b, 2)}"),
                  sources=[SRC["finance"] if metric in ("revenue", "margin", "discount") else SRC["defects"]])


@tool("what_if", "analysis", "Считаю сценарий «что если»",
      "Сценарий: ограничить скидку по продукту (discount_cap, value=доля %), изменить цену (price_change, value=%), снизить брак линии (defect_target, value=% брака). Эластичность спроса по цене задаётся, по умолчанию −0,8. Возвращает маржу и прибыль до/после за неделю.",
      {"scenario": {"type": "string", "enum": ["discount_cap", "price_change", "defect_target"]}, "value": {"type": "number"},
       "product": {"type": "string", "description": "например «Фотокнига Premium»"}, "line": {"type": "string"},
       "elasticity": {"type": "number", "description": "реакция спроса на цену, обычно от −0,5 до −1,5"}},
      required=["scenario", "value"], keywords=("что если", "что будет", "сценар", "ограничить", "снизить", "повысить", "купон"))
def what_if(ctx, scenario, value, product="", line="", elasticity=-0.8):
    cur = S.inw(S.ROWS, *S.CUR_W)
    n = S.CUR_W[1] - S.CUR_W[0] + 1
    if scenario == "defect_target":
        rows = S.where(cur, line=line or S.R["ricoh"])
        cps = S.ssum(rows, "cost") / S.ssum(rows, "sheets")
        saved = S.ssum(rows, "defects") - S.ssum(rows, "sheets") * value / 100
        return Result(data=dict(scenario=scenario, line=line or S.R["ricoh"], now_pct=round(S.rate(rows) * 100, 2), target_pct=value,
                                saved_defects_per_week=round(saved / n), saved_rub_per_week=round(max(0, saved) * cps / n),
                                summary=f"брак {round(S.rate(rows)*100,2)}% → {value}%"), sources=[SRC["defects"], SRC["finance"]])
    rows = S.where(cur, product=product) if product else cur
    rev, cost, disc = S.ssum(rows, "revenue") / n, S.ssum(rows, "cost") / n, S.ssum(rows, "discount") / n
    gross = rev + disc
    now_d = disc / gross
    price_k = (1 - value / 100) / (1 - now_d) if scenario == "discount_cap" else 1 + value / 100
    vol_k = max(0.0, 1 + elasticity * (price_k - 1))
    new_rev, new_cost = rev * price_k * vol_k, cost * vol_k
    out = dict(scenario=scenario, product=product or "все", elasticity=elasticity, price_change_pct=round((price_k - 1) * 100, 1),
               volume_change_pct=round((vol_k - 1) * 100, 1), margin_now_pct=round((rev - cost) / rev * 100, 1),
               margin_new_pct=round((new_rev - new_cost) / new_rev * 100, 1) if new_rev else 0,
               profit_now_rub_week=round(rev - cost), profit_new_rub_week=round(new_rev - new_cost),
               assumption="Эластичность спроса — допущение, не измерена по данным компании.")
    out["summary"] = f"прибыль в неделю {out['profit_now_rub_week']} → {out['profit_new_rub_week']} руб."
    return Result(data=out, sources=[SRC["finance"]])


@tool("forecast_demand", "analysis", "Строю прогноз спроса",
      "Прогноз числа заказов на N недель вперёд (тренд + коридор неопределённости), с графиком. Сезонность не учитывается, если истории меньше года.",
      {"weeks": {"type": "integer", "description": "горизонт, 1–12"}}, keywords=("прогноз", "спрос", "будет", "декабр", "сезон", "мощност"))
def forecast_demand(ctx, weeks=4):
    weeks = min(12, max(1, int(weeks or 4)))
    ws = sorted({r["w"] for r in S.ROWS})
    y = [S.ssum(_week_rows(S.ROWS, w), "orders") for w in ws]
    k = 8
    xs, ys = ws[-k:], y[-k:]
    mx, my = sum(xs) / k, sum(ys) / k
    slope = sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / sum((a - mx) ** 2 for a in xs)
    icpt = my - slope * mx
    resid = [b - (icpt + slope * a) for a, b in zip(xs, ys)]
    sd = sqrt(sum(e * e for e in resid) / (k - 2))
    fc = [dict(week=S.week_label(S.LAST + i), orders=round(icpt + slope * (S.LAST + i)), low=round(icpt + slope * (S.LAST + i) - 1.96 * sd),
               high=round(icpt + slope * (S.LAST + i) + 1.96 * sd)) for i in range(1, weeks + 1)]
    peak = max(y)
    fig, ax = plt.subplots(figsize=(7, 3.2))
    ax.plot([S.week_label(w) for w in ws[-16:]], y[-16:], color=INK, label="факт")
    ax.plot([f["week"] for f in fc], [f["orders"] for f in fc], color=ACC, marker="o", label="прогноз")
    ax.fill_between([f["week"] for f in fc], [f["low"] for f in fc], [f["high"] for f in fc], color=ACC, alpha=.2)
    ax.axhline(peak * 0.9, color=BAD, ls="--", lw=1, label="90% лучшей недели")
    style(ax, "Заказы в неделю: факт и прогноз", "заказов")
    ax.legend(frameon=False, fontsize=8); plt.xticks(rotation=45, fontsize=7)
    over = [f["week"] for f in fc if f["orders"] > peak * 0.9]
    return Result(data=dict(history_weeks=len(ws), forecast=fc, best_week_orders=peak, weeks_over_90pct_of_best=over,
                            caveat="История короче года: сезонность не учтена, это линейный тренд последних 8 недель.",
                            summary=f"через {weeks} нед. ≈ {fc[-1]['orders']} заказов"),
                  sources=[SRC["defects"]], artifacts=[fig_to_artifact(fig, "Прогноз заказов")])


@tool("spc_chart", "analysis", "Строю контрольную карту",
      "Контрольная карта доли брака по неделям (p-chart): границы 3σ по базовым неделям, сигналы выхода процесса из-под контроля.",
      {"line": {"type": "string"}, "shift": {"type": "string", "enum": ["День", "Ночь"]}},
      keywords=("контрольн", "spc", "стабильн", "вышел", "процесс", "карт"))
def spc_chart(ctx, line="Ricoh", shift=""):
    rows = S.where(S.ROWS, line=line, shift=shift)
    base = S.inw(rows, *S.BASE_W)
    p0, nbar = S.rate(base), S.ssum(base, "sheets") / (S.BASE_W[1] - S.BASE_W[0] + 1)
    ucl = p0 + 3 * sqrt(p0 * (1 - p0) / nbar)
    ws = sorted({r["w"] for r in rows if r["w"] >= S.BASE_W[0] - 6})
    pts = [S.rate(_week_rows(rows, w)) for w in ws]
    sig = [S.week_label(w) for w, p in zip(ws, pts) if p > ucl]
    fig, ax = plt.subplots(figsize=(7, 3.2))
    ax.plot([S.week_label(w) for w in ws], [p * 100 for p in pts], color=INK, marker="o", ms=3)
    ax.axhline(p0 * 100, color=MUTE, lw=1); ax.axhline(ucl * 100, color=BAD, ls="--", lw=1)
    style(ax, f"Контрольная карта брака: {line} {shift}".strip(), "% брака"); plt.xticks(rotation=45, fontsize=7)
    return Result(data=dict(line=line, center_pct=round(p0 * 100, 2), ucl_pct=round(ucl * 100, 2), out_of_control_weeks=sig,
                            last_pct=round(pts[-1] * 100, 2), summary=f"выход за границу: {len(sig)} нед."),
                  sources=[SRC["defects"]], artifacts=[fig_to_artifact(fig, "Контрольная карта брака")])


@tool("check_effect", "analysis", "Проверяю эффект решения",
      "Проверить, помогло ли решение: сравнение изменения брака на целевой линии с контрольной линией (разность разностей) до и после недели решения.",
      {"decision_week": {"type": "integer", "description": "номер недели, с которой решение действует"}, "line": {"type": "string"},
       "control_line": {"type": "string"}}, required=["decision_week"], keywords=("помог", "эффект", "сработал", "решени"))
def check_effect(ctx, decision_week, line="Ricoh", control_line="Fuji Frontier"):
    def d(l):
        rows = S.where(S.ROWS, line=l)
        b, a = S.rate(S.inw(rows, decision_week - 3, decision_week - 1)), S.rate(S.inw(rows, decision_week, S.LAST))
        return b * 100, a * 100
    tb, ta = d(line); cb, ca = d(control_line)
    after_weeks = S.LAST - decision_week + 1
    ok = after_weeks >= 1
    return Result(data=dict(line=line, before_pct=round(tb, 2), after_pct=round(ta, 2), control_before_pct=round(cb, 2), control_after_pct=round(ca, 2),
                            effect_pp=round((ta - tb) - (ca - cb), 2), weeks_after=after_weeks,
                            caveat="" if after_weeks >= 2 else "После решения прошло меньше двух недель, вывод предварительный.",
                            summary="эффект по разности разностей"), sources=[SRC["defects"]]) if ok else Result(data=dict(error="Нет данных после решения."))


@tool("abc_xyz", "analysis", "Делаю ABC/XYZ-анализ",
      "ABC по выручке и XYZ по стабильности спроса по продуктам: что кормит бизнес и что нестабильно.",
      keywords=("abc", "ассортимент", "продукт", "стабильность"))
def abc_xyz(ctx):
    ws = sorted({r["w"] for r in S.ROWS})
    prods = sorted({r["product"] for r in S.ROWS})
    rev = {p: S.ssum(S.where(S.ROWS, product=p), "revenue") for p in prods}
    tot, acc, out = sum(rev.values()), 0, []
    for p in sorted(prods, key=lambda p: -rev[p]):
        acc += rev[p]
        series = [S.ssum(S.where(_week_rows(S.ROWS, w), product=p), "orders") for w in ws]
        cv = statistics.pstdev(series) / (sum(series) / len(series))
        out.append(dict(product=p, share_pct=round(100 * rev[p] / tot, 1), abc="A" if acc / tot <= .8 else "B" if acc / tot <= .95 else "C",
                        xyz="X" if cv < .1 else "Y" if cv < .25 else "Z", variation_pct=round(cv * 100, 1)))
    return Result(data=dict(products=out, summary=f"A-продукт: {out[0]['product']}"), sources=[SRC["finance"]])


@tool("unit_economics", "analysis", "Считаю экономику заказа",
      "Выручка, себестоимость, скидка и маржа на один заказ по продукту за последние две недели.",
      {"product": {"type": "string"}}, keywords=("экономик", "на заказ", "чек", "себестоим", "unit"))
def unit_economics(ctx, product=""):
    r = S.inw(S.where(S.ROWS, product=product), *S.CUR_W)
    o = S.ssum(r, "orders")
    if not o:
        return Result(data=dict(error="Нет такого продукта."))
    return Result(data=dict(product=product or "все", revenue_per_order=round(S.ssum(r, "revenue") / o, 1), cost_per_order=round(S.ssum(r, "cost") / o, 1),
                            discount_per_order=round(S.ssum(r, "discount") / o, 1), margin_pct=round(S.margin(r) * 100, 1), summary="экономика одного заказа"),
                  sources=[SRC["finance"]])
