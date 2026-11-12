from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Секрет, который раньше стоял в .env.example и коде: им может подписать токен кто угодно — не принимаем
KNOWN_SECRETS = {"dev-secret-change-me-in-production-0123456789"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://localhost:5432/picpac"
    # подпись токенов: обязателен, свой для каждого стенда; без него сервер не стартует
    jwt_secret: str = Field(min_length=32)
    # по умолчанию — как в продукте: без кода 0000 и без /dev/*; на стенде показа DEMO_MODE=true в .env
    demo_mode: bool = False
    otp_demo_code: str = "0000"
    storage_dir: str = "./storage"
    build_stage_delay: float = 0.6   # секунд на этап сборки (для живого экрана «Собираем»)
    point_value_rub: float = 0.10    # 1 пик = 0,10 руб. (Алеся, #30, notes/16-points.md)
    points_max_share: float = 0.30   # пиками — не больше 30% стоимости товаров, доставка не входит
    jwt_ttl_days: int = 30
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b-instruct"
    ollama_timeout_s: float = 20

    @field_validator("jwt_secret")
    @classmethod
    def secret_is_own(cls, v: str) -> str:
        if v in KNOWN_SECRETS:
            raise ValueError("JWT_SECRET из примера — задайте свой (см. .env.example)")
        return v


settings = Settings()
