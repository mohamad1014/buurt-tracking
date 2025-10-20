import importlib
import os
from pathlib import Path
from typing import Tuple

import pytest
from fastapi.testclient import TestClient


def reload_backend() -> Tuple[object, object, object, object, object]:
    import backend  # noqa: WPS433
    import backend.app  # noqa: WPS433
    import backend.database  # noqa: WPS433
    import backend.models  # noqa: WPS433
    import backend.settings  # noqa: WPS433
    import backend.storage_service  # noqa: WPS433

    importlib.reload(backend.settings)
    importlib.reload(backend.storage_service)
    importlib.reload(backend.database)
    importlib.reload(backend.models)
    importlib.reload(backend.app)

    return (
        backend,
        backend.app,
        backend.database,
        backend.models,
        backend.storage_service,
    )


@pytest.fixture(scope='session')
def app_context(tmp_path_factory):
    storage_dir = tmp_path_factory.mktemp('storage')
    db_path = storage_dir / 'events.db'

    env = {
        'API_KEY': 'test-key',
        'TELEGRAM_BOT_TOKEN': 'token',
        'TELEGRAM_CHAT_ID': 'chat',
        'MEDIA_TOKEN_SECRET': 'secret',
        'DATABASE_URL': f'sqlite:///{db_path}',
        'ENABLE_S3': 'false',
    }
    for key, value in env.items():
        os.environ[key] = value

    backend_pkg, app_module, database_module, models_module, storage_module = reload_backend()
    storage_module.STORAGE_ROOT = Path(storage_dir)
    app_module.STORAGE_ROOT = Path(storage_dir)
    storage_module.ensure_storage()
    models_module.init_db(database_module.engine)

    return {
        'package': backend_pkg,
        'app_module': app_module,
        'database_module': database_module,
        'models_module': models_module,
        'storage_module': storage_module,
        'storage_dir': Path(storage_dir),
    }


@pytest.fixture
def client(app_context):
    app = app_context['app_module'].app
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def storage_dir(app_context):
    return app_context['storage_dir']


@pytest.fixture
def db_session(app_context):
    session = app_context['database_module'].SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clean_state(app_context, storage_dir, db_session):
    snapshots = storage_dir / 'snapshots'
    chunks = storage_dir / 'chunks'
    snapshots.mkdir(parents=True, exist_ok=True)
    chunks.mkdir(parents=True, exist_ok=True)
    for directory in (snapshots, chunks):
        for child in directory.rglob('*'):
            if child.is_file():
                child.unlink()

    Event = app_context['models_module'].Event
    db_session.query(Event).delete()
    db_session.commit()
