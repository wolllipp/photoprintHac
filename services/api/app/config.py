from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://localhost:5432/picpac"
    jwt_secret: str = "dev-secret-change-me-in-production-0123456789"
    demo_mode: bool = True
    otp_demo_code: str = "0000"
    storage_dir: str = "./storage"
    build_stage_delay: float = 0.6   # секунд на этап сборки (для живого экрана «Собираем»)
    point_value_rub: float = 0.10    # 1 пик = 0,10 руб. (Алеся, #30, notes/16-points.md)
    points_max_share: float = 0.30   # пиками — не больше 30% стоимости товаров, доставка не входит
    jwt_ttl_days: int = 30
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b-instruct"
    ollama_timeout_s: float = 20


settings = Settings()
