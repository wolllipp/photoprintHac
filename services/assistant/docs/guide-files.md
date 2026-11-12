# Руководство: как собирать файлы в run_python

Все файлы сохраняй в рабочую папку (текущая папка, путь в WS). Один и тот же код может читать то, что создано раньше.

## График
```python
import matplotlib.pyplot as plt
from collections import defaultdict
agg = defaultdict(lambda: [0, 0])
for r in DATA:
    agg[r["w"]][0] += r["defects"]; agg[r["w"]][1] += r["sheets"]
weeks = sorted(agg)
fig, ax = plt.subplots(figsize=(8, 4))
ax.plot(weeks, [agg[w][0] / agg[w][1] * 100 for w in weeks], color="#e8a900", lw=3)
ax.set_title("Брак по неделям, %")
fig.savefig("defects.png", dpi=150, bbox_inches="tight")
```

## Презентация с нуля
Размер 16:9, у каждого слайда заголовок-вывод, 2–4 тезиса крупным шрифтом, картинка не заменяет текст: рядом с графиком подпись-вывод.
```python
from pptx import Presentation
from pptx.util import Inches, Pt
p = Presentation(); p.slide_width, p.slide_height = Inches(13.33), Inches(7.5)
def slide(title, bullets, img=None):
    s = p.slides.add_slide(p.slide_layouts[6])
    t = s.shapes.add_textbox(Inches(.6), Inches(.4), Inches(12), Inches(1)).text_frame
    t.word_wrap = True; t.text = title; t.paragraphs[0].font.size = Pt(30); t.paragraphs[0].font.bold = True
    w = 6 if img else 12
    b = s.shapes.add_textbox(Inches(.6), Inches(1.6), Inches(w), Inches(5)).text_frame; b.word_wrap = True
    for i, x in enumerate(bullets):
        para = b.paragraphs[0] if i == 0 else b.add_paragraph(); para.text = "• " + x; para.font.size = Pt(20)
    if img: s.shapes.add_picture(img, Inches(7), Inches(1.6), width=Inches(5.8))
slide("Брак вырос на Ricoh", ["вывод 1", "вывод 2"], "defects.png")
p.save("deck.pptx")
```

## Дополнить готовую презентацию
Сначала list_files и read_file, чтобы увидеть, что уже есть. Затем откройте и сохраните тот же файл:
```python
from pptx import Presentation
p = Presentation("deck.pptx")
# ... добавить слайды теми же размерами и стилем ...
p.save("deck.pptx")
```
Не создавайте новую презентацию, если просят «добавить»: правьте существующую.

## Документ и таблица
```python
from docx import Document
d = Document(); d.add_heading("Заголовок", 1); d.add_paragraph("текст"); d.save("note.docx")
from openpyxl import Workbook
wb = Workbook(); ws = wb.active; ws.append(["Линия", "Брак"]); ws.append(["Ricoh", 0.031]); wb.save("table.xlsx")
```

## Правила качества
- Числа только из DATA или из результатов инструментов; считай кодом, не в уме.
- Не пиши названия инструментов и служебных таблиц на слайдах; источник пиши по-человечески («данные производства за недели 40–45»).
- Слайд не должен состоять из одного графика без вывода и не должен содержать пустых списков.
- Для презентации о системе используй документы about-insight и about-assistant (search_docs).
