from typing import Optional

import httpx

from .settings import settings


async def send_photo(photo_path: str, caption: str) -> Optional[int]:
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendPhoto"
    async with httpx.AsyncClient(timeout=10) as client:
        with open(photo_path, 'rb') as file:
            files = {'photo': file}
            data = {'chat_id': settings.telegram_chat_id, 'caption': caption}
            response = await client.post(url, data=data, files=files)
            response.raise_for_status()
            payload = response.json()
            return payload.get('result', {}).get('message_id')
