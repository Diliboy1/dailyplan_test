from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Phase 2 修改
class Settings(BaseSettings):
    app_name: str = "DailyPlan API"
    app_env: str = "development"
    app_debug: bool = True

    backend_cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "dailyplan"
    db_password: str = "dailyplan"
    db_name: str = "dailyplan"
    db_echo: bool = False

    jwt_secret_key: str = "please-change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60

    # Phase 3A 新增
    llm_api_key: str = "sk-your-api-key-here"
    llm_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    llm_model: str = "qwen3.6-plus"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 32768

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
