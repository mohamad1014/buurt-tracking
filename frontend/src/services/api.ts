const API_BASE = import.meta.env.VITE_BACKEND_BASE_URL?.replace(/\/$/, '') ?? '';

const API_KEY_HEADER = 'X-API-Key';

export interface EventMetaPayload {
  ts: string;
  company_key: string;
  track_id: string;
  bbox_xyxy: [number, number, number, number];
  avg_conf: number;
  duration_ms: number;
  clip_score?: number;
  clip_enabled: boolean;
  video_ref?: string;
}

export interface EventResponse {
  event_id: string;
  telegram_sent: boolean;
  video_ref?: string;
}

export interface PresignRequest {
  session_id: string;
  index: number;
  started_at: string;
  content_type: string;
}

export interface PresignResponse {
  url: string;
  key: string;
  headers?: Record<string, string>;
}

const apiKey = () => localStorage.getItem('api_key') ?? '';

export async function postEvent(meta: EventMetaPayload, snapshot: Blob): Promise<EventResponse> {
  const form = new FormData();
  form.append('meta', JSON.stringify(meta));
  form.append('snapshot', snapshot, `${meta.track_id}.jpg`);

  const res = await fetch(`${API_BASE}/event`, {
    method: 'POST',
    headers: {
      [API_KEY_HEADER]: apiKey(),
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Failed to post event: ${res.status}`);
  }
  return (await res.json()) as EventResponse;
}

export async function uploadChunkLocal(
  sessionId: string,
  index: number,
  startedAt: string,
  chunk: Blob,
): Promise<void> {
  const form = new FormData();
  form.append('session_id', sessionId);
  form.append('index', String(index));
  form.append('started_at', startedAt);
  form.append('chunk', chunk, `chunk_${index}.webm`);

  const res = await fetch(`${API_BASE}/upload/chunk`, {
    method: 'POST',
    headers: {
      [API_KEY_HEADER]: apiKey(),
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Chunk upload failed: ${res.status}`);
  }
}

export async function requestPresign(body: PresignRequest): Promise<PresignResponse> {
  const res = await fetch(`${API_BASE}/upload/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [API_KEY_HEADER]: apiKey(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Presign failed: ${res.status}`);
  }
  return (await res.json()) as PresignResponse;
}

export async function commitUpload(sessionId: string, index: number, key: string): Promise<void> {
  const res = await fetch(`${API_BASE}/upload/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [API_KEY_HEADER]: apiKey(),
    },
    body: JSON.stringify({ session_id: sessionId, index, key }),
  });
  if (!res.ok) {
    throw new Error(`Commit failed: ${res.status}`);
  }
}

export interface EventListItem {
  event_id: string;
  ts: string;
  company_key: string;
  avg_conf: number;
  duration_ms: number;
  clip_enabled: boolean;
  clip_score?: number;
  snapshot_path: string;
  video_ref?: string;
  telegram_message_id?: number;
}

export interface EventListResponse {
  items: EventListItem[];
  total: number;
}

export interface EventListFilters {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  company_key?: string;
  clip_enabled?: boolean;
}

export async function fetchEvents(filters: EventListFilters): Promise<EventListResponse> {
  const params = new URLSearchParams();
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.offset) params.append('offset', String(filters.offset));
  if (filters.from) params.append('from_ts', filters.from);
  if (filters.to) params.append('to_ts', filters.to);
  if (filters.company_key) params.append('company_key', filters.company_key);
  if (typeof filters.clip_enabled === 'boolean') params.append('clip_enabled', String(filters.clip_enabled));

  const res = await fetch(`${API_BASE}/events?${params.toString()}`, {
    headers: {
      [API_KEY_HEADER]: apiKey(),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch events: ${res.status}`);
  }
  return (await res.json()) as EventListResponse;
}

export function setApiKey(key: string) {
  localStorage.setItem('api_key', key);
}

export async function resolveMediaUrl(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/media-token?path=${encodeURIComponent(path)}`, {
    headers: {
      [API_KEY_HEADER]: apiKey(),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to resolve media token: ${res.status}`);
  }
  const { token } = (await res.json()) as { token: string };
  return `${API_BASE}/media/${path}?t=${encodeURIComponent(token)}`;
}

export { API_BASE };
