from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql+psycopg://urban:urban@localhost:5433/urban_inspection"
    upload_dir: Path = Path("uploads")
    frontend_url: str = "http://localhost:5173"
    # No default on purpose: the app refuses to start until a secret is set in .env.
    jwt_secret: str
    access_token_expire_minutes: int = 480


settings = Settings()
