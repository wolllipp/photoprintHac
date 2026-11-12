"""Сборка артефактов по замыслу модели: она сама решает, сколько слайдов, о чём они и какие графики нужны.
Данные модель берёт из других инструментов; числа в тексте проверяются по результатам этого диалога,
при расхождении инструмент возвращает замечание, и модель пересобирает файл."""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from pathlib import Path

from docx import Document
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

from .. import policy
from .. import workspace as W
from ..registry import Result, tool
from . import artifacts
from ._common import OUT, SRC, file_artifact, new_name

BLACK, YELLOW, GREY = RGBColor(0x1D, 0x1D, 0x1B), RGBColor(0xE8, 0xA9, 0x00), RGBColor(0x8A, 0x8A, 0x85)
CHART = {"type": "object", "properties": {"metric": {"type": "string", "enum": list(artifacts.METRICS)},
                                           "split_by": {"type": "string", "enum": ["", "line", "shift", "product"]}}, "required": ["metric"]}


def _ungrounded(ctx, texts: list[str]) -> list[str]:
    ev = ctx.get("evidence", "")
    return policy.ungrounded_numbers(" ".join(texts), ev) if ev else []


@tool("build_deck", "artifacts", "Проектирую презентацию",
      "Собрать презентацию pptx по ВАШЕМУ замыслу: вы сами решаете число слайдов, заголовки, тезисы и графики. Сначала получите данные другими инструментами (explain_deviation, kpi_overview, compare_periods и т.д.), затем опишите слайды. Числа в тезисах должны быть из результатов инструментов, иначе файл не создастся и придёт замечание.",
      {"title": {"type": "string"}, "audience": {"type": "string"},
       "append_to": {"type": "string", "description": "имя существующей презентации из list_files: тогда слайды добавятся В НЕЁ, новый файл не создаётся (для просьб «добавь слайдов»)"},
       "slides": {"type": "array", "description": "слайды по порядку",
                  "items": {"type": "object", "properties": {"title": {"type": "string"}, "bullets": {"type": "array", "items": {"type": "string"}},
                                                             "chart": CHART, "source": {"type": "string", "description": "откуда данные слайда обычными словами (например, «данные производства за недели 40–45»), без названий инструментов"}}, "required": ["title"]}}},
      required=["title", "slides"], keywords=("презентац", "слайд", "разбор", "для технолог", "для совета", "deck", "pptx"))
def build_deck(ctx, title, slides, audience="", append_to=""):
    texts = [b for s in slides for b in (s.get("bullets") or [])] + [s.get("title", "") for s in slides]
    from ..registry import REGISTRY  # служебные имена не должны попадать на слайды: это замечание получает модель
    shown = " ".join(texts + [s.get("source", "") for s in slides])
    leaked = sorted({n for n in REGISTRY if n in shown} | set(re.findall(r"\b[a-z]+_[a-z_]+\b", shown)))
    thin = [s.get("title", "?") for s in slides if len([b for b in (s.get("bullets") or []) if len(b.strip()) > 3]) == 0]
    if leaked or thin:
        return Result(data=dict(error="Файл не создан. " + (f"На слайдах служебные названия ({', '.join(leaked)}): напишите источник обычными словами. " if leaked else "") +
                                (f"На слайдах без текста ({', '.join(thin)}) нужны 2–4 тезиса с выводом: график не заменяет текст. " if thin else "") + "Исправьте и вызовите build_deck снова."))
    bad = _ungrounded(ctx, texts)
    if bad:
        return Result(data=dict(error="Файл не создан: в слайдах числа, которых нет в результатах инструментов: " + ", ".join(bad) +
                                ". Получите нужные данные инструментом или уберите числа и вызовите build_deck снова."))
    sid = ctx.get("session", "")
    if append_to:
        src = W.path(sid) / Path(append_to).name
        if not src.is_file():
            return Result(data=dict(error=f"файла «{append_to}» нет в рабочей папке", files=[x["name"] for x in W.listing(sid)]))
        p = Presentation(src)
    else:
        p = Presentation(); p.slide_width, p.slide_height = Inches(13.33), Inches(7.5)
        s = p.slides.add_slide(p.slide_layouts[6])
        bg = s.shapes.add_shape(1, 0, 0, p.slide_width, p.slide_height); bg.fill.solid(); bg.fill.fore_color.rgb = BLACK; bg.line.fill.background()
        t = s.shapes.add_textbox(Inches(0.8), Inches(2.6), Inches(11.5), Inches(2)).text_frame; t.word_wrap = True; t.text = title
        t.paragraphs[0].font.size, t.paragraphs[0].font.bold, t.paragraphs[0].font.color.rgb = Pt(42), True, YELLOW
        if audience:
            q = t.add_paragraph(); q.text = f"для: {audience}"; q.font.size, q.font.color.rgb = Pt(18), RGBColor(255, 255, 255)
    charts = 0
    for sl in slides:
        s = p.slides.add_slide(p.slide_layouts[6])
        bar = s.shapes.add_shape(1, 0, 0, p.slide_width, Inches(0.25)); bar.fill.solid(); bar.fill.fore_color.rgb = YELLOW; bar.line.fill.background()
        h = s.shapes.add_textbox(Inches(0.6), Inches(0.5), Inches(12), Inches(1)).text_frame; h.word_wrap = True; h.text = sl["title"]
        h.paragraphs[0].font.size, h.paragraphs[0].font.bold, h.paragraphs[0].font.color.rgb = Pt(28), True, BLACK
        ch = sl.get("chart")
        width = 6.0 if ch else 12.0
        bl = sl.get("bullets") or []
        if bl:
            chars = sum(len(b) for b in bl) * (2 if ch else 1)  # текст не должен вылезать за слайд: кегль по объёму
            size = 20 if chars < 320 else 17 if chars < 520 else 14 if chars < 800 else 12
            tf = s.shapes.add_textbox(Inches(0.6), Inches(1.7), Inches(width), Inches(5)).text_frame; tf.word_wrap = True
            for i, b in enumerate(bl):
                para = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); para.text = "• " + b; para.font.size = Pt(size); para.space_after = Pt(8)
        if ch and ch.get("metric") in artifacts.METRICS:
            img = artifacts.make_chart(ctx, ch["metric"], ch.get("split_by", "")).artifacts[0]
            s.shapes.add_picture(str(OUT / img["name"]), Inches(6.9), Inches(1.7), width=Inches(6.0)); charts += 1
        if sl.get("source"):
            f = s.shapes.add_textbox(Inches(0.6), Inches(6.9), Inches(12), Inches(0.4)).text_frame; f.text = "Источник: " + sl["source"]
            f.paragraphs[0].font.size, f.paragraphs[0].font.color.rgb = Pt(11), GREY
    name = Path(append_to).name if append_to else new_name("deck", "pptx")
    p.save(W.path(sid) / name)
    return Result(data=dict(file=name, slides=len(p.slides), charts=charts, summary=f"презентация из {len(p.slides)} слайдов, графиков: {charts}"),
                  sources=[SRC["defects"], SRC["finance"]], artifacts=[W.artifact(sid, name, title)])


@tool("build_docx", "artifacts", "Составляю документ",
      "Собрать документ docx по вашему замыслу: заголовок и разделы (заголовок + текст). Для записок, отчётов, ответов, ТЗ. Числа должны быть из результатов инструментов.",
      {"title": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object",
       "properties": {"heading": {"type": "string"}, "text": {"type": "string"}}, "required": ["heading", "text"]}}},
      required=["title", "sections"], keywords=("документ", "записк", "отчёт", "отчет", "письмо", "docx", "приказ", "тз"))
def build_docx(ctx, title, sections):
    bad = _ungrounded(ctx, [s.get("text", "") for s in sections])
    if bad:
        return Result(data=dict(error="Документ не создан: числа без источника: " + ", ".join(bad) + ". Получите данные инструментом или уберите числа."))
    d = Document(); d.add_heading(title, 1)
    for s in sections:
        d.add_heading(s["heading"], 2); d.add_paragraph(s["text"])
    d.add_paragraph("Черновик подготовлен ассистентом. Проверьте и утвердите.").runs[0].italic = True
    name = new_name("doc", "docx"); d.save(OUT / name)
    return Result(data=dict(file=name, sections=len(sections), summary="документ готов"), artifacts=[file_artifact(name, title)])


@tool("schedule_meeting", "people", "Готовлю приглашение на встречу",
      "Подготовить приглашение на встречу: файл календаря .ics (открывается в Google Calendar, Outlook, Календаре) с темой, временем, участниками и повесткой. Ссылку на видеовстречу (Google Meet, Teams) ассистент создать не может, пока не подключён календарь с учётной записью; в этом случае честно скажите об этом и предложите .ics.",
      {"title": {"type": "string"}, "date": {"type": "string", "description": "ГГГГ-ММ-ДД"}, "time": {"type": "string", "description": "ЧЧ:ММ"},
       "duration_min": {"type": "integer"}, "attendees": {"type": "array", "items": {"type": "string"}}, "agenda": {"type": "string"}},
      required=["title", "date", "time"], keywords=("встреч", "созвон", "google meet", "meet", "календар", "пригласи", "приглашение", "teams", "zoom"))
def schedule_meeting(ctx, title, date, time, duration_min=45, attendees=None, agenda=""):
    start = datetime.fromisoformat(f"{date}T{time}")
    end = start + timedelta(minutes=int(duration_min or 45))
    f = lambda d: d.strftime("%Y%m%dT%H%M%S")
    esc = lambda x: x.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\;")
    ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//picPac//Assistant//RU", "BEGIN:VEVENT", f"UID:{new_name('m', 'x')}@picpac",
           f"DTSTAMP:{f(datetime.now())}", f"DTSTART:{f(start)}", f"DTEND:{f(end)}", f"SUMMARY:{esc(title)}",
           f"DESCRIPTION:{esc(agenda + chr(10) + 'Участники: ' + ', '.join(attendees or []))}", "END:VEVENT", "END:VCALENDAR"]
    name = new_name("meeting", "ics"); (OUT / name).write_text("\r\n".join(ics), encoding="utf-8")
    return Result(data=dict(file=name, start=start.isoformat(), end=end.isoformat(), attendees=attendees or [],
                            limitation="Ссылка на видеовстречу не создана: календарь (Google, Teams) не подключён. Приглашение сохранено как .ics; приглашённым его нужно отправить отдельно.",
                            summary="приглашение .ics готово"), artifacts=[file_artifact(name, title + " (.ics)")])
