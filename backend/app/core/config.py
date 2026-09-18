"""
CareBridge AI Configuration Management
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

class Settings(BaseSettings):
    PROJECT_NAME: str = "CareBridge AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Environment & Keys
    ENVIRONMENT: str = "development"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./carebridge.db"
    
    # Safety Engine Parameters
    MANDATORY_DISCLAIMER: str = (
        "CareBridge AI is an AI recovery coordinator, not a doctor. "
        "It does not provide medical diagnoses or alter prescribed treatments. "
        "For emergencies, please call 911 immediately."
    )
    
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = Path(__file__).resolve().parent.parent / "data"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
