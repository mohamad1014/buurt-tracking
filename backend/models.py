from datetime import datetime

from sqlalchemy import Column, Float, Integer, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Event(Base):
    __tablename__ = 'events'

    event_id = Column(String, primary_key=True)
    ts = Column(String, nullable=False)
    company_key = Column(String, nullable=False)
    track_id = Column(String, nullable=False)
    bbox_x1 = Column(Float, nullable=False)
    bbox_y1 = Column(Float, nullable=False)
    bbox_x2 = Column(Float, nullable=False)
    bbox_y2 = Column(Float, nullable=False)
    avg_conf = Column(Float, nullable=False)
    duration_ms = Column(Integer, nullable=False)
    clip_enabled = Column(Integer, nullable=False)
    clip_score = Column(Float, nullable=True)
    snapshot_path = Column(String, nullable=False)
    video_ref = Column(String, nullable=True)
    telegram_message_id = Column(Integer, nullable=True)
    created_at = Column(String, nullable=False, default=lambda: datetime.utcnow().isoformat())


def init_db(engine):
    Base.metadata.create_all(bind=engine)
