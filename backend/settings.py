from typing import List, Optional

from pydantic import BaseSettings


class Settings(BaseSettings):
    api_key: str
    telegram_bot_token: str
    telegram_chat_id: str
    database_url: str = 'sqlite:///./events.db'
    enable_clip: bool = False
    clip_positive_prompts: str = 'company logo,company car'
    clip_negative_prompts: str = 'unrelated signage,street sign,poster'
    clip_sim_threshold: float = 0.27
    enable_s3: bool = False
    s3_bucket_name: Optional[str] = None
    s3_region: Optional[str] = None
    s3_access_key_id: Optional[str] = None
    s3_secret_access_key: Optional[str] = None
    s3_endpoint_url: Optional[str] = None
    s3_presign_expiry_seconds: int = 3600
    enable_cors_origins: Optional[str] = None
    media_token_secret: str

    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'
        case_sensitive = False

    @property
    def cors_origins(self) -> List[str]:
        if not self.enable_cors_origins:
            return []
        return [origin.strip() for origin in self.enable_cors_origins.split(',') if origin.strip()]


settings = Settings()
