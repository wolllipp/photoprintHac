from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://localhost:5432/picpac"
    jwt_secret: str = "dev-secret-change-me-in-production-0123456789"
    demo_mode: bool = True
    otp_demo_code: str = "0000"
    storage_dir: str = "./storage"
    build_stage_delay: float = 0.6   # секунд на этап сборки (для живого экрана «Собираем»)
    point_value_rub: float = 0.01    # ДОПУЩЕНИЕ: цену пика определяет Алеся (#30)
    jwt_ttl_days: int = 30


settings = Settings()
