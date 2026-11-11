# picPac Ассистент: агент руководителя

Реальный агент для экрана «Ассистент» в `design/insight`. Дизайн и обоснование: [notes/26-assistant-agent.md](../../notes/26-assistant-agent.md), идеи: [notes/27-assistant-ideas.md](../../notes/27-assistant-ideas.md).

## Запуск
```bash
brew install ollama && ollama serve &        # локальная модель
ollama pull qwen3:4b                          # проба на малой модели; на H200 — vLLM и модель крупнее
cd services/assistant && uv sync
uv run uvicorn app.server:app --port 8001
python3 -m http.server 8080 --directory ../../design/insight   # открыть http://localhost:8080 → «Ассистент»
uv run pytest                                 # 13 тестов, модель не нужна
```
Другая модель или сервер: `ASSISTANT_MODEL`, `ASSISTANT_LLM_URL` (см. `.env.example`), любой OpenAI-совместимый API. Если сервис не запущен, макет остаётся в сценарном режиме со старыми заготовленными ответами.

## Устройство
| Файл | Что |
|---|---|
| `app/registry.py` | контракт инструмента `@tool(...)`, роли, риск `read/write/external`, маршрутизация 6–8 инструментов под вопрос |
| `app/agent.py` | цикл: вопрос → вызовы инструментов с проверкой прав → ответ со ссылками → проверка чисел |
| `app/policy.py` | маскирование ПДн, `<untrusted_data>`, подтверждения (`Pending`), журнал (`Audit`), поиск чисел без источника |
| `app/llm.py` | адаптер OpenAI-совместимой модели |
| `app/server.py` | `POST /chat` (SSE), `POST /actions/{id}/confirm|reject`, `/files/*`, `/audit`, `/meta` |
| `app/store.py` | данные: `data/demo.json` выгружен из `insight.js`, цифры совпадают с макетом |
| `app/tools/*.py` | плагины: **новый инструмент = новый файл или функция с `@tool`**, ядро не меняется |

## Инструменты (26)
- **analysis:** `kpi_overview`, `explain_deviation`, `compare_periods`, `what_if`, `forecast_demand`, `spc_chart`, `check_effect`, `abc_xyz`, `unit_economics`, `run_python` (песочница)
- **artifacts:** `make_chart`, `pareto_defects`, `quarterly_deck` (pptx), `report_docx` (записка, ответ по претензии), `workbook_xlsx` (модель с формулами)
- **people:** `prepare_meeting`, `list_tasks`, `propose_task`, `ask_colleague`, `poll_group`, `meeting_protocol`
- **watch:** `morning_brief`, `threshold_watch`, `data_quality_check`, `customer_feedback`
- **knowledge:** `search_docs`

## Защита (проверено тестами)
- Роль `manager` не получает кадровые показатели; роли `admin` ассистент отказывает (403). Инструмента нет в списке роли, и вызов по имени отклоняется на сервере.
- Запись и отправка сообщений только карточкой подтверждения; подтвердить может тот, для кого подготовлено, один раз.
- Инструкция в запросе («игнорируй предыдущие…») блокируется до модели; тексты клиентов и записей идут модели как данные.
- Числа в ответе, которых нет в результатах инструментов, помечаются «требует уточнения».
- `run_python`: белый список импортов, без `open/exec/eval`, лимит CPU и времени, оператор скрыт от `manager`.

## Ограничения демо
- Мессенджер — заглушка: ответы коллег заготовлены (`people.CANNED`). В продукте — коннектор.
- Роль берётся из заголовка `X-Role`; в продукте — JWT CRM.
- Песочница `run_python` изолирует процесс и код, но не сеть на уровне ОС. В продукте — контейнер без сети.
- Модель 4B иногда ошибается в выборе аргументов и формулировках: числа защищены проверкой, а качество на цепочках из нескольких инструментов надо мерить на 10 вопросах (Марк).
