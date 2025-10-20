import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents, resolveMediaUrl, setApiKey, type EventListItem } from '../services/api';

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

export function DashboardPage() {
  const [companyKey, setCompanyKey] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('api_key') ?? '');

  const queryKey = useMemo(() => ['events', { companyKey, from, to }], [companyKey, from, to]);
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () =>
      fetchEvents({
        limit: 100,
        offset: 0,
        company_key: companyKey || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  return (
    <main style={{ padding: '1rem', color: '#f8fafc' }}>
      <h1>Event Dashboard</h1>
      <section style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label>
          API Key
          <input
            value={apiKey}
            onChange={(e) => {
              const value = e.target.value;
              setApiKeyState(value);
              setApiKey(value);
            }}
          />
        </label>
        <label>
          Company
          <input value={companyKey} onChange={(e) => setCompanyKey(e.target.value)} />
        </label>
        <label>
          From
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={() => refetch()}>Refresh</button>
      </section>
      {isLoading && <p>Loading events...</p>}
      <section style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
        {data?.items.map((event) => (
          <EventCard key={event.event_id} event={event} />
        ))}
      </section>
    </main>
  );
}

function EventCard({ event }: { event: EventListItem }) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSnapshotUrl(null);
    setVideoUrl(null);
    if (event.snapshot_path) {
      resolveMediaUrl(event.snapshot_path)
        .then((url) => {
          if (active) setSnapshotUrl(url);
        })
        .catch((err) => console.error(err));
    }
    if (event.video_ref) {
      resolveMediaUrl(event.video_ref)
        .then((url) => {
          if (active) setVideoUrl(url);
        })
        .catch((err) => console.error(err));
    }
    return () => {
      active = false;
    };
  }, [event.snapshot_path, event.video_ref]);

  return (
    <article style={{ background: '#111827', borderRadius: '8px', padding: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>{event.company_key.toUpperCase()}</strong>
        <span>{formatDate(event.ts)}</span>
      </header>
      <p>Duration: {(event.duration_ms / 1000).toFixed(2)}s</p>
      <p>Avg confidence: {event.avg_conf.toFixed(2)}</p>
      {event.clip_enabled && <p>CLIP score: {event.clip_score?.toFixed(2) ?? 'n/a'}</p>}
      <details>
        <summary>Media</summary>
        {snapshotUrl && <img src={snapshotUrl} alt="snapshot" style={{ maxWidth: '100%' }} />}
        {videoUrl && (
          <video controls style={{ width: '100%', marginTop: '0.5rem' }} src={videoUrl} />
        )}
      </details>
    </article>
  );
}
