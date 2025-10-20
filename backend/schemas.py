from datetime import datetime
from datetime import datetime
from typing import List, Optional, Tuple

from pydantic import BaseModel, validator


class EventMeta(BaseModel):
    ts: datetime
    company_key: str
    track_id: str
    bbox_xyxy: Tuple[float, float, float, float]
    avg_conf: float
    duration_ms: int
    clip_score: Optional[float] = None
    clip_enabled: bool
    video_ref: Optional[str] = None

    @validator('avg_conf')
    def check_avg_conf(cls, v):
        if not 0 <= v <= 1:
            raise ValueError('avg_conf must be between 0 and 1')
        return v

    @validator('duration_ms')
    def check_duration(cls, v):
        if v < 0:
            raise ValueError('duration_ms must be positive')
        return v

    @validator('bbox_xyxy')
    def check_bbox(cls, v):
        if v[2] <= v[0] or v[3] <= v[1]:
            raise ValueError('bbox must have positive area')
        return v


class EventResponseItem(BaseModel):
    event_id: str
    ts: datetime
    company_key: str
    avg_conf: float
    duration_ms: int
    clip_enabled: bool
    clip_score: Optional[float]
    snapshot_path: str
    video_ref: Optional[str]
    telegram_message_id: Optional[int]


class EventListResponse(BaseModel):
    items: List[EventResponseItem]
    total: int
