from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ENV: Literal["dev", "test", "staging"]
    DATABASE_URL: str
    JENKINS_BASE_URL: str
    JENKINS_TOKEN: str
    STORAGE_PATH: str
    SCAN_TIMEOUT: int
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
    DEBUG: bool = False
    MOCK_EXECUTION: bool = False
    CALLBACK_TOKEN: str
    API_KEY: str
    REDIS_URL: str = "redis://redis:6379/0"

    model_config = SettingsConfigDict(
        extra="ignore",
        env_file=None,  # Don't load from .env file, use environment variables
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def validate_runtime_rules(self):
        if self.ENV == "staging" and self.DEBUG:
            raise ValueError("DEBUG must be false in staging")

        if self.SCAN_TIMEOUT <= 0:
            raise ValueError("SCAN_TIMEOUT must be a positive integer")

        # Note: Removed test-specific mock requirement to allow real Jenkins testing
        # Test can now use either mocked Jenkins or real Jenkins server

        # Validate security tokens for non-test environments or when using real Jenkins
        if self.ENV != "test" or not self.MOCK_EXECUTION:
            if not self.CALLBACK_TOKEN or len(self.CALLBACK_TOKEN.strip()) < 32:
                raise ValueError("CALLBACK_TOKEN must be set and at least 32 characters")
            if not self.API_KEY or len(self.API_KEY.strip()) < 32:
                raise ValueError("API_KEY must be set and at least 32 characters")

        return self


settings = Settings()
