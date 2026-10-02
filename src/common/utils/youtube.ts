const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);
const VIDEO_ID = /^[\w-]{11}$/;
const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/'];
const OEMBED_TIMEOUT_MS = 4000;
const MAX_TITLE_LENGTH = 120;

export function parseVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let id: string | null = null;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
    id = prefix
      ? url.pathname.slice(prefix.length).split('/')[0]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export async function fetchVideoTitle(videoId: string): Promise<string | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const fallbackTitle = `YouTube · ${videoId}`;
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
      { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) },
    );
    if (response.status >= 400 && response.status < 500) return null;
    if (!response.ok) return fallbackTitle;
    const data = (await response.json()) as { title?: unknown };
    return typeof data.title === 'string' && data.title
      ? data.title.slice(0, MAX_TITLE_LENGTH)
      : fallbackTitle;
  } catch {
    return fallbackTitle;
  }
}
