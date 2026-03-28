from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: Optional[str] = None
    model_name: str = "claude-sonnet-4-20250514"
    cors_origins: list[str] = ["http://localhost:5173"]
    mock_mode: bool = True  # Use mock events by default (no API key needed)

    model_config = {"env_file": ".env"}

    @model_validator(mode="after")
    def validate_api_key_for_live_mode(self):
        if not self.mock_mode and not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when MOCK_MODE=false")
        return self


settings = Settings()
