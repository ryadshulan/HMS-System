const assert = require('assert');
const { buildPostTitle, createFacebookNewsClient } = require('../facebook-news');

async function run() {
  assert.strictEqual(buildPostTitle('First line\nSecond line'), 'First line');

  let calls = 0;
  const client = createFacebookNewsClient({
    pageId: '107738988661891',
    accessToken: 'test-token',
    graphVersion: 'v24.0',
    cacheTtlMs: 30 * 1000,
    fetchImpl: async (url) => {
      calls += 1;
      assert.strictEqual(url.pathname, '/v24.0/107738988661891/posts');
      assert.strictEqual(url.searchParams.get('access_token'), 'test-token');
      return {
        ok: true,
        async json() {
          return {
            data: [
              {
                id: '107738988661891_1',
                message: 'Latest shipment update',
                created_time: '2026-07-24T10:00:00+0000',
                full_picture: 'https://example.com/post.jpg',
                permalink_url: 'https://facebook.com/post/1',
                is_published: true,
              },
            ],
          };
        },
      };
    },
  });

  const first = await client.getPosts();
  const second = await client.getPosts();

  assert.strictEqual(calls, 1);
  assert.strictEqual(first.length, 1);
  assert.strictEqual(second[0].source, 'facebook');
  assert.strictEqual(first[0].externalId, '107738988661891_1');
  assert.strictEqual(first[0].title, 'Latest shipment update');
  assert.strictEqual(first[0].imageProvider, 'facebook');
  assert.strictEqual(client.getStatus().configured, true);

  const disabledClient = createFacebookNewsClient({
    pageId: '107738988661891',
    accessToken: '',
    fetchImpl: async () => {
      throw new Error('This fetch must not run.');
    },
  });
  assert.deepStrictEqual(await disabledClient.getPosts(), []);
  assert.strictEqual(disabledClient.getStatus().configured, false);

  const originalDateNow = Date.now;
  let now = Date.now();
  let staleCalls = 0;

  try {
    Date.now = () => now;
    const staleFallbackClient = createFacebookNewsClient({
      pageId: '107738988661891',
      accessToken: 'test-token',
      cacheTtlMs: 30 * 1000,
      fetchImpl: async () => {
        staleCalls += 1;
        if (staleCalls > 1) {
          return {
            ok: false,
            async json() {
              return { error: { code: 190, message: 'Temporary token error' } };
            },
          };
        }

        return {
          ok: true,
          async json() {
            return {
              data: [{
                id: '107738988661891_stale',
                message: 'Cached Facebook post',
                created_time: '2026-07-24T10:00:00+0000',
                is_published: true,
              }],
            };
          },
        };
      },
    });

    const cachedPosts = await staleFallbackClient.getPosts();
    now += 31 * 1000;
    const stalePosts = await staleFallbackClient.getPosts();

    assert.strictEqual(staleCalls, 2);
    assert.deepStrictEqual(stalePosts, cachedPosts);
    assert.match(staleFallbackClient.getStatus().lastError, /Temporary token error/);
  } finally {
    Date.now = originalDateNow;
  }

  console.log('Facebook news unit test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
