"""Application configuration and settings."""

from pathlib import Path
from typing import Set

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Configuration
    api_keys: str = ""  # Comma-separated valid API keys
    cors_origins: str = "*"  # Comma-separated allowed origins

    # Storage
    storage_dir: Path = Path("/tmp/inksight")
    max_file_size_mb: int = 50

    # Processing
    queue_workers: int = 2
    job_timeout_seconds: int = 300

    # Logging
    log_level: str = "INFO"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def get_valid_api_keys(self) -> Set[str]:
        """Parse and return valid API keys as a set."""
        if not self.api_keys:
            return set()
        return {key.strip() for key in self.api_keys.split(",") if key.strip()}

    def get_cors_origins(self) -> list[str]:
        """Parse and return CORS origins."""
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


# Global settings instance
settings = Settings()
