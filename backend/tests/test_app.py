import io
import json
from datetime import datetime, timezone

API_KEY_HEADER = {'X-API-Key': 'test-key'}


def test_event_ingest_stores_snapshot_and_row(client, storage_dir, db_session, monkeypatch):
    from backend.models import Event

    async def fake_send_photo(path: str, caption: str):  # noqa: ARG001
        return 123

    monkeypatch.setattr('backend.app.send_photo', fake_send_photo)

    now = datetime.now(timezone.utc)
    payload = {
        'ts': now.isoformat(),
        'company_key': 'acme',
        'track_id': 'track_1',
        'bbox_xyxy': [0, 0, 10, 10],
        'avg_conf': 0.8,
        'duration_ms': 1600,
        'clip_enabled': True,
        'clip_score': 0.32,
        'video_ref': 'chunks/2025/10/19/session/120000_0.webm',
    }

    files = {
        'meta': (None, json.dumps(payload), 'application/json'),
        'snapshot': ('frame.jpg', io.BytesIO(b'data'), 'image/jpeg'),
    }

    response = client.post('/event', headers=API_KEY_HEADER, files=files)
    assert response.status_code == 200
    body = response.json()
    assert body['telegram_sent'] is True
    assert 'event_id' in body

    snapshot_dir = storage_dir / 'snapshots' / now.strftime('%Y') / now.strftime('%m') / now.strftime('%d')
    stored_files = list(snapshot_dir.glob('*.jpg'))
    assert len(stored_files) == 1

    events = db_session.query(Event).all()
    assert len(events) == 1
    event = events[0]
    assert event.company_key == 'acme'
    assert event.telegram_message_id == 123


def test_upload_chunk_stores_file(client, storage_dir):
    started_at = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    files = {
        'chunk': ('chunk.webm', io.BytesIO(b'chunk-data'), 'video/webm'),
    }
    data = {
        'session_id': 'session-1',
        'index': '0',
        'started_at': started_at.isoformat(),
    }

    response = client.post('/upload/chunk', headers=API_KEY_HEADER, data=data, files=files)
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'stored'

    chunk_path = storage_dir / body['file']
    assert chunk_path.is_file()
    with chunk_path.open('rb') as handle:
        assert handle.read() == b'chunk-data'


def test_media_token_allows_snapshot_access(client, storage_dir):
    resource = storage_dir / 'snapshots' / '2024' / '01' / '01'
    resource.mkdir(parents=True, exist_ok=True)
    target = resource / 'event.jpg'
    target.write_bytes(b'img')

    token_resp = client.get('/media-token', headers=API_KEY_HEADER, params={'path': str(target.relative_to(storage_dir))})
    assert token_resp.status_code == 200
    token = token_resp.json()['token']

    media_resp = client.get(f"/media/{target.relative_to(storage_dir)}", params={'t': token})
    assert media_resp.status_code == 200
    assert media_resp.content == b'img'


def test_missing_api_key_rejected(client):
    resp = client.get('/events')
    assert resp.status_code == 401


def test_events_list_returns_data(client, db_session):
    from backend.models import Event

    event = Event(
        event_id='event-1',
        ts='2024-01-01T12:00:00+00:00',
        company_key='acme',
        track_id='track',
        bbox_x1=0.0,
        bbox_y1=0.0,
        bbox_x2=1.0,
        bbox_y2=1.0,
        avg_conf=0.8,
        duration_ms=1500,
        clip_enabled=1,
        clip_score=0.5,
        snapshot_path='snapshots/2024/01/01/event-1.jpg',
        video_ref='chunks/2024/01/01/session/120000_0.webm',
        telegram_message_id=111,
        created_at='2024-01-01T12:00:01+00:00',
    )
    db_session.add(event)
    db_session.commit()

    resp = client.get('/events', headers=API_KEY_HEADER)
    assert resp.status_code == 200
    body = resp.json()
    assert body['total'] == 1
    assert body['items'][0]['event_id'] == 'event-1'
