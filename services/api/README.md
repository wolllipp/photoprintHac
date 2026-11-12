# picPac API

FastAPI + PostgreSQL (pgvector). Контекст: `notes/14-backend-start.md`.

```bash
cp .env.example .env
docker compose up -d                       # Postgres+pgvector на :5433
docker exec api-db-1 psql -U picpac -c "create extension if not exists vector"
uv run alembic upgrade head
uv run python -m app.seed                  # каталог и доставка
uv run uvicorn app.main:app --reload       # http://localhost:8000/docs
docker exec api-db-1 createdb -U picpac picpac_test   # один раз, для тестов
uv run pytest
```

Интеграционные тесты удаляют все таблицы из `TEST_DATABASE_URL`, поэтому используйте отдельную одноразовую тестовую базу.

## Принципы
- Фото попадают в систему только если человек выбрал их сам. Галерею не читаем и не анализируем.
- Черновик собирается без регистрации (гостевой токен); вход по телефону — при оформлении, черновик переходит к аккаунту.
- Story Mode и раскладка — демо-логика; отбор в `app/ai/` определяет только точные дубли по байтам. Проверки резкости/лиц и подписи пока заглушки (DEMO_MODE).
- Каталог — `app/seed.py`. Что взято не с сайта — помечено `extra.assumed`, ждёт Алесю.

## Ручки (по экранам journey.html)
| Экран | Ручки |
|---|---|
| Вход | `POST /auth/guest`, `POST /auth/otp/request`, `POST /auth/otp/verify` (демо-код `0000`), `GET /me` |
| Главная | `GET /home` |
| Загрузка | `POST /photos` (multipart), `GET /photos/{id}/file` |
| Опишите книгу (Б) | `POST /projects/story` |
| Свой выбор (А) | `POST /projects`, `POST /projects/{id}/photos` |
| Собираем | `POST /projects/{id}/build`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel` |
| Отбор фото | `GET/PATCH /projects/{id}/selection` |
| Книга и цена | `GET /catalog/quote`, `/catalog/products`, `/catalog/delivery` |
| Оформление | `POST /orders` (книга или фотопечать `prints`, допуслуги `extras`, промокод `promo_code`) |
| Правка книги | `GET /projects/{id}/pages`, `PUT /projects/{id}/pages/{position}` |
| Поддержка | `POST/GET /orders/{id}/support` — обращение по заказу |
| Отслеживание | `GET /orders`, `GET /orders/{id}` |
| Демо | `POST /dev/orders/{id}/advance[?done=6]`, `POST /dev/points` (только DEMO_MODE) |

Пока нет: события клиентского пути для Insight, реальная оплата. Ассистент — `services/assistant`, дашборд — `design/insight`.
