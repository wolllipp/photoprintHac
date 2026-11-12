"""Артефакты для руководителя: графики, презентация, docx, xlsx."""
from __future__ import annotations

import matplotlib.pyplot as plt
from docx import Document
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

from .. import store as S
from ..registry import Result, tool
from . import analysis
from ._common import ACC, INK, MUTE, OUT, SRC, fig_to_artifact, file_artifact, new_name, style

METRICS = {"defect": ("Доля брака, %", lambda r: S.rate(r) * 100), "revenue": ("Выручка, руб.", lambda r: S.ssum(r, "revenue")),
           "margin": ("Маржа, %", lambda r: S.margin(r) * 100), "discount": ("Скидка, %", lambda r: S.discount_share(r) * 100),
           "downtime": ("Простой, ч", lambda r: S.ssum(r, "downtime")), "orders": ("Заказы", lambda r: S.ssum(r, "orders"))}


def _series(metric, split="", weeks=16):
    ws = [w for w in sorted({r["w"] for r in S.ROWS}) if w > S.LAST - weeks]
    f = METRICS[metric][1]
    keys = sorted({r[split] for r in S.ROWS}) if split else [None]
    return ws, {(k or "все"): [f([r for r in S.ROWS if r["w"] == w and (not k or r[split] == k)]) for w in ws] for k in keys}


@tool("make_chart", "artifacts", "Строю график",
      "Построить график показателя по неделям; можно разбить по линии, смене или продукту (trend), либо по разрезам за последние две недели (bar).",
      {"metric": {"type": "string", "enum": list(METRICS)}, "split_by": {"type": "string", "enum": ["", "line", "shift", "product"]},
       "weeks": {"type": "integer"}}, required=["metric"], keywords=("график", "диаграмм", "нарисуй", "покажи динамику", "визуализ"))
def make_chart(ctx, metric, split_by="", weeks=16):
    ws, ser = _series(metric, split_by, int(weeks or 16))
    fig, ax = plt.subplots(figsize=(7, 3.2))
    cols = [INK, ACC, MUTE, "#c0392b"]
    for i, (k, v) in enumerate(ser.items()):
        ax.plot([S.week_label(w) for w in ws], v, label=k, color=cols[i % 4], marker="o", ms=3)
    style(ax, METRICS[metric][0] + " по неделям", METRICS[metric][0]); plt.xticks(rotation=45, fontsize=7)
    if split_by:
        ax.legend(frameon=False, fontsize=8)
    last = {k: round(v[-1], 2) for k, v in ser.items()}
    return Result(data=dict(metric=METRICS[metric][0], last_week_values=last, summary="график построен"), sources=[SRC["finance"] if metric in ("revenue", "margin", "discount") else SRC["defects"]],
                  artifacts=[fig_to_artifact(fig, METRICS[metric][0])])


@tool("pareto_defects", "artifacts", "Строю Парето брака",
      "Диаграмма Парето брака в рублях по разрезу (оператор, смена, линия, поставщик, продукт) за последние две недели.",
      {"by": {"type": "string", "enum": ["operator", "shift", "line", "supplier", "product"]}}, keywords=("парето", "структур брака", "топ"))
def pareto_defects(ctx, by="operator"):
    cur = S.inw(S.ROWS, *S.CUR_W)
    cps = S.ssum(cur, "cost") / S.ssum(cur, "sheets")
    g = {}
    for r in cur:
        g[r[by]] = g.get(r[by], 0) + r["defects"] * cps
    items = sorted(g.items(), key=lambda x: -x[1])
    tot, acc, cum = sum(g.values()), 0, []
    for _, v in items:
        acc += v; cum.append(acc / tot * 100)
    fig, ax = plt.subplots(figsize=(7, 3.2))
    ax.bar([k[:18] for k, _ in items], [v for _, v in items], color=ACC)
    ax2 = ax.twinx(); ax2.plot(range(len(items)), cum, color=INK, marker="o", ms=3); ax2.set_ylim(0, 105)
    style(ax, f"Потери от брака за 2 недели по разрезу «{S.DIMS[by]}», руб.", "руб."); plt.setp(ax.get_xticklabels(), rotation=30, fontsize=7)
    return Result(data=dict(by=S.DIMS[by], items=[dict(name=k, rub=round(v), share_pct=round(100 * v / tot)) for k, v in items[:6]], total_rub=round(tot),
                            note="потери оценены как число бракованных листов × средняя себестоимость листа", summary=f"лидер: {items[0][0]}"),
                  sources=[SRC["defects"], SRC["finance"]], artifacts=[fig_to_artifact(fig, "Парето брака")])


def _kpi_table(role):
    a, b = S.LAST - 1, S.LAST
    cur, base = S.kpis(a, b, role), S.kpis(S.BASE_W[0], S.BASE_W[1], role)
    return [(k, base[k], cur[k]) for k in cur]


@tool("quarterly_deck", "artifacts", "Собираю презентацию",
      "Готовый ШАБЛОН презентации (6 фиксированных слайдов). Для нестандартной структуры, аудитории или темы используйте build_deck, а этот только для типового отчёта. Собрать презентацию pptx по показателям: сводка, динамика брака и выручки, причина отклонения, потери, предлагаемые решения. Источники указаны на слайдах.",
      {"title": {"type": "string"}, "audience": {"type": "string", "description": "для кого: совет директоров, совещание, команда"},
       "per_kpi": {"type": "boolean", "description": "true — добавить отдельный слайд на каждый показатель (база, сейчас, изменение, отношение к норме)"}},
      keywords=("презентац", "слайд", "квартал", "отчёт", "отчет", "deck", "pptx", "добавь в презентацию", "пункт на каждый"))
def quarterly_deck(ctx, title="Итоги периода", audience="совещание", per_kpi=False):
    exp = analysis.explain_deviation(ctx, "defect").data
    p = Presentation(); p.slide_width, p.slide_height = Inches(13.33), Inches(7.5)
    black, yellow = RGBColor(0x1D, 0x1D, 0x1B), RGBColor(0xE8, 0xA9, 0x00)

    def slide(head, foot=""):
        s = p.slides.add_slide(p.slide_layouts[6])
        bar = s.shapes.add_shape(1, 0, 0, p.slide_width, Inches(0.25)); bar.fill.solid(); bar.fill.fore_color.rgb = yellow; bar.line.fill.background()
        t = s.shapes.add_textbox(Inches(0.6), Inches(0.5), Inches(12), Inches(1)).text_frame; t.text = head
        t.paragraphs[0].font.size, t.paragraphs[0].font.bold, t.paragraphs[0].font.color.rgb = Pt(30), True, black
        if foot:
            f = s.shapes.add_textbox(Inches(0.6), Inches(6.9), Inches(12), Inches(0.4)).text_frame; f.text = "Источник: " + foot
            f.paragraphs[0].font.size, f.paragraphs[0].font.color.rgb = Pt(11), RGBColor(0x8A, 0x8A, 0x85)
        return s

    def bullets(s, lines, top=1.7):
        tf = s.shapes.add_textbox(Inches(0.6), Inches(top), Inches(12), Inches(4.8)).text_frame; tf.word_wrap = True
        for i, l in enumerate(lines):
            para = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); para.text = "• " + l; para.font.size = Pt(20); para.space_after = Pt(10)

    s = p.slides.add_slide(p.slide_layouts[6])
    bg = s.shapes.add_shape(1, 0, 0, p.slide_width, p.slide_height); bg.fill.solid(); bg.fill.fore_color.rgb = black; bg.line.fill.background()
    t = s.shapes.add_textbox(Inches(0.8), Inches(2.6), Inches(11.5), Inches(2)).text_frame; t.word_wrap = True; t.text = title
    t.paragraphs[0].font.size, t.paragraphs[0].font.bold, t.paragraphs[0].font.color.rgb = Pt(44), True, yellow
    q = t.add_paragraph(); q.text = f"picPac Insight · для: {audience} · данные на {S.D['meta']['today']}"; q.font.size, q.font.color.rgb = Pt(18), RGBColor(255, 255, 255)

    s = slide("Показатели: сейчас и в базовый период", "mart_margin_weekly, mart_defects_weekly")
    rows = _kpi_table(ctx["role"])
    tbl = s.shapes.add_table(len(rows) + 1, 3, Inches(0.6), Inches(1.6), Inches(12), Inches(0.4) * (len(rows) + 1)).table
    for j, h in enumerate(("Показатель", "База (нед. 7–14)", "Последние 2 недели")):
        tbl.cell(0, j).text = h
    for i, (k, b, c) in enumerate(rows, 1):
        tbl.cell(i, 0).text, tbl.cell(i, 1).text, tbl.cell(i, 2).text = k, str(b), str(c)
        for j in range(3):
            tbl.cell(i, j).text_frame.paragraphs[0].font.size = Pt(14)

    for tool_res, cap in ((make_chart(ctx, "defect", "line"), "Доля брака по линиям"), (make_chart(ctx, "revenue"), "Выручка по неделям")):
        s = slide(cap, "mart_defects_weekly, mart_margin_weekly")
        s.shapes.add_picture(str(OUT / tool_res.artifacts[0]["name"]), Inches(1.2), Inches(1.5), width=Inches(10.9))

    if per_kpi:  # по слайду на показатель: только числа и сравнение с базой, причины не выдумываем
        for k, b, c in rows:
            d = c - b
            s = slide(k, "mart_margin_weekly, mart_defects_weekly")
            bullets(s, [f"База (недели 7–14): {b}", f"Последние 2 недели: {c}",
                        f"Изменение: {'+' if d >= 0 else ''}{round(d, 2)}" + (f" ({'+' if d >= 0 else ''}{round(100 * d / b, 1)}%)" if b else "")])
    top = exp["best_dimension_first"][0]
    s = slide("Главное отклонение: брак на Ricoh", "mart_defects_weekly, журнал простоев, накладные")
    bullets(s, [f"Брак вырос с {exp['overall_before_pct']}% до {exp['overall_now_pct']}%",
                f"Сильнее всего объясняет разрез «{top['dimension']}»: {top['top'][0]['value']} даёт {top['top'][0]['share_of_increase_pct']}% прироста при {top['top'][0]['share_of_volume_pct']}% объёма",
                f"Ночная смена Ricoh: {exp['ricoh_night_now_pct']}%, дневная: {exp['ricoh_day_now_pct']}%",
                f"Оценка потерь за две недели: {exp['est_loss_rub_two_weeks']} руб.", exp["caveat"]])
    s = slide("Предлагаемые решения", "реестр решений")
    bullets(s, ["Калибровка Ricoh перед ночной сменой, наставник для новых операторов", "Запросить протокол входного контроля партии РБ-1141",
                "Проверка эффекта через 14 дней по контрольной линии", "Решения вносит руководитель: ассистент только предлагает"])
    name = new_name("deck", "pptx"); p.save(OUT / name)
    return Result(data=dict(slides=len(p.slides), file=name, summary=f"презентация из {len(p.slides)} слайдов"), sources=[SRC["defects"], SRC["finance"]],
                  artifacts=[file_artifact(name, title)])


@tool("report_docx", "artifacts", "Готовлю документ",
      "Подготовить docx: служебную записку по отклонению (kind=memo) или черновик ответа клиенту по претензии (kind=claim_reply). Черновик, который правит и утверждает человек.",
      {"kind": {"type": "string", "enum": ["memo", "claim_reply"]}, "addressee": {"type": "string"}, "details": {"type": "string", "description": "уточнения, например номер заказа"}},
      required=["kind"], keywords=("записк", "документ", "docx", "word", "письмо", "ответ клиент", "претензи", "приказ"))
def report_docx(ctx, kind="memo", addressee="Начальнику производства", details=""):
    d = Document()
    if kind == "memo":
        e = analysis.explain_deviation(ctx, "defect").data
        d.add_heading("Служебная записка", 1)
        d.add_paragraph(f"Кому: {addressee}\nДата: {S.D['meta']['today']}\nТема: превышение доли брака на линии Ricoh")
        d.add_paragraph(f"Доля брака выросла с {e['overall_before_pct']}% до {e['overall_now_pct']}%. На ночных сменах Ricoh {e['ricoh_night_now_pct']}%, на дневных {e['ricoh_day_now_pct']}%. "
                        f"Оценка потерь за две недели: {e['est_loss_rub_two_weeks']} руб.")
        d.add_paragraph("Прошу: 1) провести калибровку перед ночной сменой; 2) представить протокол входного контроля партии; 3) отчитаться в срок, назначенный руководителем.")
        d.add_paragraph("Черновик подготовлен ассистентом. Проверьте и утвердите.").runs[0].italic = True
    else:
        d.add_heading("Ответ по претензии", 1)
        d.add_paragraph(f"Здравствуйте! Сожалеем, что в вашей книге обнаружен дефект печати. {details}".strip())
        d.add_paragraph("Мы бесплатно перепечатаем книгу и отправим её Европочтой. Возвращать книгу не нужно: достаточно фото дефекта в чате. Срок: 3–5 рабочих дней.")
        d.add_paragraph("Черновик подготовлен ассистентом. Перед отправкой проверьте условия в справочнике.").runs[0].italic = True
    name = new_name(kind, "docx"); d.save(OUT / name)
    return Result(data=dict(file=name, kind=kind, summary="черновик документа готов"), sources=[SRC["defects"]] if kind == "memo" else [],
                  artifacts=[file_artifact(name, "Служебная записка" if kind == "memo" else "Ответ по претензии")])


@tool("workbook_xlsx", "artifacts", "Собираю таблицу Excel",
      "Excel-модель «что если» по маржи продукта: исходные данные последних двух недель и формулы, где руководитель меняет цену и эластичность сам.",
      {"product": {"type": "string"}}, keywords=("excel", "xlsx", "таблиц", "модел"))
def workbook_xlsx(ctx, product="Фотокнига Premium"):
    r = S.where(S.inw(S.ROWS, *S.CUR_W), product=product)
    n = S.CUR_W[1] - S.CUR_W[0] + 1
    wb = Workbook(); ws = wb.active; ws.title = "Модель"
    head = PatternFill("solid", fgColor="E8A900")
    rows = [("Параметр", "Значение", "Комментарий"),
            ("Выручка в неделю, руб.", round(S.ssum(r, "revenue") / n), "mart_margin_weekly"),
            ("Себестоимость в неделю, руб.", round(S.ssum(r, "cost") / n), "mart_margin_weekly"),
            ("Изменение цены, %", 0, "меняйте"), ("Эластичность спроса", -0.8, "допущение, меняйте"),
            ("Изменение объёма, %", "=MAX(-100,B5*B4)", "формула"),
            ("Новая выручка", "=B2*(1+B4/100)*(1+B6/100)", "формула"), ("Новая себестоимость", "=B3*(1+B6/100)", "формула"),
            ("Новая маржа, %", "=IF(B7=0,0,(B7-B8)/B7*100)", "формула"), ("Прибыль в неделю, руб.", "=B7-B8", "формула")]
    for row in rows:
        ws.append(row)
    for c in ws[1]:
        c.font, c.fill = Font(bold=True), head
    ws.column_dimensions["A"].width, ws.column_dimensions["C"].width = 34, 30
    name = new_name("model", "xlsx"); wb.save(OUT / name)
    return Result(data=dict(file=name, product=product, summary="модель с формулами готова"), sources=[SRC["finance"]],
                  artifacts=[file_artifact(name, "Модель маржи")])


@tool("recent_files", "artifacts", "Нахожу готовые файлы",
      "Показать недавно созданные файлы и графики (презентации, документы, таблицы), чтобы скачать их ещё раз. Ссылок наружу ассистент не создаёт.",
      keywords=("скачать", "скачай", "ссылк", "файл", "где презентац", "дай ее", "дай её"))
def recent_files(ctx):
    files = sorted((f for f in OUT.iterdir() if f.suffix in (".pptx", ".docx", ".xlsx", ".ics")), key=lambda f: -f.stat().st_mtime)[:3]
    return Result(data=dict(files=[f.name for f in files], summary=f"файлов: {len(files)}"),
                  artifacts=[file_artifact(f.name, f.name) for f in files])
