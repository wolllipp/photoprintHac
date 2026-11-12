# Руководство: как делать файлы в run_python

Это не шаблон, а справочник приёмов. Дизайн и структуру придумываешь ты под тему и аудиторию. Файлы сохраняй в рабочую папку (текущая папка, путь в WS). Один и тот же код может открыть то, что создано раньше.

## Как делать презентацию
1. Реши посыл: что аудитория должна понять и сделать после. Слайды строятся вокруг этого, а не вокруг оглавления.
2. Заголовок слайда — вывод («Брак вырос втрое за две недели»), а не тема («Брак»).
3. Выбери палитру и шрифты под тему (вулканы — тёмные земляные и огненные; финансы — сдержанные; детям — яркие). Задай их константами и применяй везде. Фон можно красить целиком (`slide.background.fill`).
4. Чередуй раскладки: титул на весь экран, крупное число с подписью, две колонки, диаграмма + вывод, схема из блоков и стрелок, таймлайн, цитата, итог с действиями. Одинаковые слайды подряд — провал.
5. Числа показывай диаграммой, а не списком. Используй нативные диаграммы pptx (редактируются в PowerPoint), для сложных графиков — matplotlib → png → `add_picture`.
6. 1 мысль на слайд, текст крупный (≥18 пт), не больше 40 слов. Подпись-вывод рядом с каждой диаграммой.
7. Данные считай кодом из DATA (или используй факты из search_docs), цифры из головы не вставляй, если речь о компании.

## Приёмы python-pptx
```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN

p = Presentation(); p.slide_width, p.slide_height = Inches(13.33), Inches(7.5)
BG, FG, ACC = RGBColor(0x14,0x10,0x10), RGBColor(0xF5,0xEF,0xEA), RGBColor(0xFF,0x6B,0x35)

def new(bg=BG):
    s = p.slides.add_slide(p.slide_layouts[6]); s.background.fill.solid(); s.background.fill.fore_color.rgb = bg; return s

def text(s, x, y, w, h, t, size=20, bold=False, color=FG, align=None):
    tf = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)).text_frame; tf.word_wrap = True
    tf.text = t; r = tf.paragraphs[0]; r.font.size = Pt(size); r.font.bold = bold; r.font.color.rgb = color
    if align: r.alignment = align
    return tf

def block(s, x, y, w, h, color):  # плашка, линия, акцент
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid(); sh.fill.fore_color.rgb = color; sh.line.fill.background(); return sh

# крупное число
s = new(); text(s, .8, 1.2, 6, 2.5, "3,1%", 110, True, ACC); text(s, .8, 4.0, 6, 1.5, "брак на Ricoh за две недели — вдвое выше нормы", 26)

# нативная столбчатая диаграмма
cd = CategoryChartData(); cd.categories = ["Ricoh", "Fuji", "Noritsu"]; cd.add_series("Брак, %", (3.1, 1.4, 1.2))
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(7), Inches(1.2), Inches(5.8), Inches(5), cd)
ch = gf.chart; ch.has_legend = False; ch.plots[0].series[0].format.fill.solid(); ch.plots[0].series[0].format.fill.fore_color.rgb = ACC
ch.plots[0].has_data_labels = True
# другие типы: LINE_MARKERS, PIE, DOUGHNUT, BAR_CLUSTERED, AREA, XY_SCATTER

# схема: блоки и стрелка
for i, name in enumerate(["Сигнал", "Причина", "Решение", "Проверка"]):
    b = block(s, .6 + i*3.1, 5.2, 2.7, 1.1, ACC if i == 0 else RGBColor(0x2A,0x22,0x20))
    b.text_frame.text = name
p.save("deck.pptx")
```
Картинка из matplotlib: `fig.savefig("c.png", dpi=200, transparent=True)`, затем `s.shapes.add_picture("c.png", Inches(7), Inches(1.2), width=Inches(5.8))`.

## Дополнить готовую презентацию
list_files → read_file, чтобы увидеть, что есть. Затем `p = Presentation("deck.pptx")`, добавьте слайды в том же стиле и `p.save("deck.pptx")` под тем же именем. Не создавайте новую колоду, если просят «добавить».

## Документ и таблица
```python
from docx import Document
d = Document(); d.add_heading("Заголовок", 1); d.add_paragraph("текст"); d.add_picture("c.png", width=None); d.save("note.docx")
from openpyxl import Workbook
wb = Workbook(); ws = wb.active; ws.append(["Линия", "Брак"]); ws.append(["Ricoh", 0.031]); ws["C2"] = "=B2*100"; wb.save("table.xlsx")
```

## Проверка перед ответом
После выполнения кода прочитай замечания к файлам, если они есть, и исправь. Не называй пользователю инструменты и служебные таблицы. Источник на слайде пиши словами («данные производства за недели 40–45»).
