from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql+psycopg://urban:urban@localhost:5433/urban_inspection"
    upload_dir: Path = Path("uploads")
    frontend_url: str = "http://localhost:5173"


settings = Settings()
