from typing import List, Literal

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
    TEST_BYPASS_AUTH: bool = False  # Enable auth bypass in test env (must be explicit)
    CALLBACK_TOKEN: str
    API_KEY: str
    JWT_SECRET_KEY: str = ""  # Separate secret for JWT signing; falls back to API_KEY
    METRICS_TOKEN: str = ""  # Token required by Prometheus scrape config to access /metrics
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:4173"]
    SONARQUBE_URL: str = "localhost:9000"
    SONARQUBE_PROTOCOL: str = "http"
    SONARQUBE_TOKEN: str = ""

    # Cookie-based auth settings (FR-4)
    COOKIE_NAME: str = "access_token"
    REFRESH_COOKIE_NAME: str = "refresh_token"
    COOKIE_MAX_AGE: int = 3600  # 1 hour in seconds
    COOKIE_SECURE: bool = False  # True in staging/production (HTTPS); False in dev/test (HTTP)

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

        # Force secure cookies in staging (HTTPS)
        if self.ENV == "staging" and self.COOKIE_SECURE is not False:
            self.COOKIE_SECURE = True

        # Note: Removed test-specific mock requirement to allow real Jenkins testing
        # Test can now use either mocked Jenkins or real Jenkins server

        # Validate security tokens for non-test environments or when using real Jenkins
        if self.ENV != "test" or not self.MOCK_EXECUTION:
            if not self.CALLBACK_TOKEN or len(self.CALLBACK_TOKEN.strip()) < 32:
                raise ValueError(
                    "CALLBACK_TOKEN must be set and at least 32 characters"
                )
            if not self.API_KEY or len(self.API_KEY.strip()) < 32:
                raise ValueError("API_KEY must be set and at least 32 characters")

        return self


settings = Settings()
