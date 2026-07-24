function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function buildPostTitle(message, story) {
  const text = String(message || story || '').trim();
  const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() || '';

  if (!firstLine) {
    return 'منشور جديد من النجم الحديث';
  }

  return firstLine.length > 110 ? `${firstLine.slice(0, 107)}...` : firstLine;
}

function formatPostDate(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ar-YE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(date);
}

function createFacebookNewsClient(options = {}) {
  const pageId = String(options.pageId || '').trim();
  const accessToken = String(options.accessToken || '').trim();
  const graphVersion = String(options.graphVersion || 'v24.0').replace(/^\/+|\/+$/g, '');
  const graphBaseUrl = String(options.graphBaseUrl || 'https://graph.facebook.com').replace(/\/+$/, '');
  const timeZone = String(options.timeZone || 'Asia/Aden');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const limit = clampInteger(options.limit, 1, 25, 10);
  const cacheTtlMs = clampInteger(options.cacheTtlMs, 30 * 1000, 60 * 60 * 1000, 2 * 60 * 1000);
  const configured = Boolean(pageId && accessToken && typeof fetchImpl === 'function');

  let cache = {
    items: [],
    expiresAt: 0,
    lastSyncedAt: null,
    lastError: '',
  };
  let inFlight = null;

  async function fetchPosts() {
    const url = new URL(`${graphBaseUrl}/${graphVersion}/${encodeURIComponent(pageId)}/posts`);
    url.searchParams.set(
      'fields',
      'id,message,story,created_time,full_picture,permalink_url,is_published'
    );
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('access_token', accessToken);

    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.error) {
      const code = payload.error?.code ? ` (${payload.error.code})` : '';
      throw new Error(`Facebook Graph API request failed${code}.`);
    }

    const items = (Array.isArray(payload.data) ? payload.data : [])
      .filter((post) => post?.id && post.is_published !== false)
      .map((post) => {
        const description = String(post.message || post.story || '').trim();
        const publishedAt = post.created_time || '';

        return {
          _id: `facebook-${post.id}`,
          title: buildPostTitle(post.message, post.story),
          date: formatPostDate(publishedAt, timeZone),
          desc: description,
          image: String(post.full_picture || ''),
          imageProvider: 'facebook',
          source: 'facebook',
          externalId: String(post.id),
          permalink: String(post.permalink_url || ''),
          publishedAt,
          createdAt: publishedAt,
        };
      });

    cache = {
      items,
      expiresAt: Date.now() + cacheTtlMs,
      lastSyncedAt: new Date().toISOString(),
      lastError: '',
    };

    return items;
  }

  async function getPosts() {
    if (!configured) {
      return [];
    }

    if (cache.expiresAt > Date.now()) {
      return cache.items;
    }

    if (!inFlight) {
      inFlight = fetchPosts()
        .catch((error) => {
          cache.lastError = error.message;
          if (cache.items.length) {
            return cache.items;
          }
          throw error;
        })
        .finally(() => {
          inFlight = null;
        });
    }

    return inFlight;
  }

  function getStatus() {
    return {
      configured,
      pageId: pageId || null,
      cachedPosts: cache.items.length,
      lastSyncedAt: cache.lastSyncedAt,
      lastError: cache.lastError || null,
    };
  }

  return {
    getPosts,
    getStatus,
  };
}

module.exports = {
  buildPostTitle,
  createFacebookNewsClient,
};
