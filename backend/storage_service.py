from datetime import datetime
from pathlib import Path

import boto3
from botocore.client import Config
from fastapi import UploadFile

from .settings import settings

STORAGE_ROOT = Path('storage')


def ensure_storage():
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    (STORAGE_ROOT / 'snapshots').mkdir(parents=True, exist_ok=True)
    (STORAGE_ROOT / 'chunks').mkdir(parents=True, exist_ok=True)


def snapshot_path(event_id: str, ts: datetime) -> Path:
    date_path = Path(ts.strftime('%Y')) / ts.strftime('%m') / ts.strftime('%d')
    path = STORAGE_ROOT / 'snapshots' / date_path
    path.mkdir(parents=True, exist_ok=True)
    return path / f'{event_id}.jpg'


def chunk_path(session_id: str, started_at: datetime, index: int) -> Path:
    date_path = Path(started_at.strftime('%Y')) / started_at.strftime('%m') / started_at.strftime('%d')
    path = STORAGE_ROOT / 'chunks' / date_path / session_id
    path.mkdir(parents=True, exist_ok=True)
    time_part = started_at.strftime('%H%M%S')
    return path / f'{time_part}_{index}.webm'


def get_s3_client():
    session = boto3.session.Session()
    return session.client(
        's3',
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        endpoint_url=settings.s3_endpoint_url,
        config=Config(signature_version='s3v4'),
    )


def presign_chunk_key(session_id: str, started_at: datetime, index: int) -> str:
    date_path = started_at.strftime('%Y/%m/%d')
    time_part = started_at.strftime('%H%M%S')
    return f'chunks/{date_path}/{session_id}/{time_part}_{index}.webm'


def local_chunk_store(file: UploadFile, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'wb') as buffer:
        buffer.write(file.file.read())


def store_snapshot(file: UploadFile, event_id: str, ts: datetime) -> Path:
    dest = snapshot_path(event_id, ts)
    with open(dest, 'wb') as buffer:
        buffer.write(file.file.read())
    return dest
