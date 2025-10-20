from fastapi import Header, HTTPException, status
from .settings import settings


def verify_api_key(x_api_key: str = Header(..., alias='X-API-Key')):
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid API key')
