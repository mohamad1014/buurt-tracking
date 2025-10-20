import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .database import engine, get_db
from .models import Event, init_db
from .schemas import EventMeta, EventListResponse, EventResponseItem
from .security import verify_api_key
from .settings import settings
from .storage_service import (
    STORAGE_ROOT,
    chunk_path,
    ensure_storage,
    get_s3_client,
    local_chunk_store,
    presign_chunk_key,
    store_snapshot,
)
from .telegram_client import send_photo

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title='Buurt Tracking API')

limiter = Limiter(key_func=get_remote_address, default_limits=['120/minute'])
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    return JSONResponse(status_code=429, content={'detail': 'Rate limit exceeded'})


if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )


@app.on_event('startup')
async def on_startup():
    ensure_storage()
    init_db(engine)


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.post('/event')
@limiter.limit('30/minute')
async def ingest_event(
    meta: str = Form(...),
    snapshot: UploadFile = File(...),
    _: None = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    try:
        payload = json.loads(meta)
        meta_obj = EventMeta(**payload)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f'Invalid metadata: {exc}')

    event_id = str(uuid.uuid4())
    ts = meta_obj.ts
    snapshot_dest = store_snapshot(snapshot, event_id, ts)
    snapshot_rel = str(snapshot_dest.relative_to(STORAGE_ROOT))

    event = Event(
        event_id=event_id,
        ts=ts.isoformat(),
        company_key=meta_obj.company_key,
        track_id=meta_obj.track_id,
        bbox_x1=meta_obj.bbox_xyxy[0],
        bbox_y1=meta_obj.bbox_xyxy[1],
        bbox_x2=meta_obj.bbox_xyxy[2],
        bbox_y2=meta_obj.bbox_xyxy[3],
        avg_conf=meta_obj.avg_conf,
        duration_ms=meta_obj.duration_ms,
        clip_enabled=int(meta_obj.clip_enabled),
        clip_score=meta_obj.clip_score,
        snapshot_path=snapshot_rel,
        video_ref=meta_obj.video_ref,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(event)
    db.commit()

    caption_lines = [
        f"[{meta_obj.company_key.upper()}] Car detected",
        f"Time: {ts.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"Duration: {meta_obj.duration_ms / 1000:.2f}s",
        f"Avg conf: {meta_obj.avg_conf:.2f}",
    ]
    if meta_obj.clip_enabled:
        clip_part = meta_obj.clip_score if meta_obj.clip_score is not None else 0
        caption_lines.append(f"CLIP: enabled ({clip_part:.2f})")
    caption = '\n'.join(caption_lines)

    telegram_sent = False
    try:
        message_id = await send_photo(str(snapshot_dest), caption)
        if message_id:
            event.telegram_message_id = message_id
            telegram_sent = True
            db.add(event)
            db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning('Failed to send Telegram notification: %s', exc)

    return {'event_id': event_id, 'telegram_sent': telegram_sent, 'video_ref': meta_obj.video_ref}


@app.post('/upload/chunk')
@limiter.limit('30/minute')
async def upload_chunk(
    session_id: str = Form(...),
    index: int = Form(...),
    started_at: str = Form(...),
    chunk: UploadFile = File(...),
    _: None = Depends(verify_api_key),
):
    if settings.enable_s3:
        raise HTTPException(status_code=400, detail='S3 uploads enabled; use presigned flow')
    try:
        started_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    dest = chunk_path(session_id, started_dt, index)
    local_chunk_store(chunk, dest)
    rel = str(dest.relative_to(STORAGE_ROOT))
    return {'status': 'stored', 'file': rel}


@app.post('/upload/presign')
@limiter.limit('30/minute')
async def presign_upload(
    body: dict = Body(...),
    _: None = Depends(verify_api_key),
):
    if not settings.enable_s3:
        raise HTTPException(status_code=400, detail='S3 disabled')
    required = {'session_id', 'index', 'started_at', 'content_type'}
    if not required.issubset(body):
        raise HTTPException(status_code=400, detail='Missing fields for presign request')
    started_dt = datetime.fromisoformat(body['started_at'].replace('Z', '+00:00'))
    key = presign_chunk_key(body['session_id'], started_dt, int(body['index']))
    client = get_s3_client()
    url = client.generate_presigned_url(
        ClientMethod='put_object',
        Params={
            'Bucket': settings.s3_bucket_name,
            'Key': key,
            'ContentType': body['content_type'],
        },
        ExpiresIn=settings.s3_presign_expiry_seconds,
    )
    return {'url': url, 'key': key, 'headers': {'Content-Type': body['content_type']}}


@app.post('/upload/commit')
@limiter.limit('30/minute')
async def commit_upload(body: dict = Body(...), _: None = Depends(verify_api_key)):
    if not settings.enable_s3:
        raise HTTPException(status_code=400, detail='S3 disabled')
    required = {'session_id', 'index', 'key'}
    if not required.issubset(body):
        raise HTTPException(status_code=400, detail='Missing commit fields')
    logger.info('Committed upload: session=%s index=%s key=%s', body['session_id'], body['index'], body['key'])
    return {'status': 'committed'}


@app.get('/events', response_model=EventListResponse)
async def list_events(
    limit: int = 50,
    offset: int = 0,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    company_key: Optional[str] = None,
    clip_enabled: Optional[bool] = None,
    _: None = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    filters = []
    if company_key:
        filters.append(Event.company_key == company_key)
    if clip_enabled is not None:
        filters.append(Event.clip_enabled == int(clip_enabled))
    if from_ts:
        filters.append(Event.ts >= from_ts)
    if to_ts:
        filters.append(Event.ts <= to_ts)
    count_stmt = select(func.count()).select_from(Event)
    query_stmt = select(Event)
    if filters:
        count_stmt = count_stmt.where(*filters)
        query_stmt = query_stmt.where(*filters)
    total = db.scalar(count_stmt)
    query = query_stmt.order_by(Event.ts.desc()).limit(limit).offset(offset)
    rows = db.scalars(query).all()
    items = [
        EventResponseItem(
            event_id=row.event_id,
            ts=datetime.fromisoformat(row.ts),
            company_key=row.company_key,
            avg_conf=row.avg_conf,
            duration_ms=row.duration_ms,
            clip_enabled=bool(row.clip_enabled),
            clip_score=row.clip_score,
            snapshot_path=row.snapshot_path,
            video_ref=row.video_ref,
            telegram_message_id=row.telegram_message_id,
        )
        for row in rows
    ]
    return EventListResponse(items=items, total=total or 0)


def create_media_token(path: str) -> str:
    payload = {
        'path': path,
        'exp': datetime.utcnow() + timedelta(minutes=5),
    }
    return jwt.encode(payload, settings.media_token_secret, algorithm='HS256')


@app.get('/media-token')
async def media_token(path: str, _: None = Depends(verify_api_key)):
    return {'token': create_media_token(path)}


@app.get('/media/{resource_path:path}')
async def serve_media(resource_path: str, t: str):
    try:
        payload = jwt.decode(t, settings.media_token_secret, algorithms=['HS256'])
    except jwt.PyJWTError as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=str(exc))
    if payload.get('path') != resource_path:
        raise HTTPException(status_code=403, detail='Invalid token path')

    if settings.enable_s3:
        client = get_s3_client()
        url = client.generate_presigned_url(
            ClientMethod='get_object',
            Params={'Bucket': settings.s3_bucket_name, 'Key': resource_path},
            ExpiresIn=300,
        )
        return {'url': url}

    file_path = STORAGE_ROOT / resource_path
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail='File not found')
    return FileResponse(file_path)
