const { spawn } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config({ quiet: true });

const testDatabaseName = 'hms_codex_site_analytics_test';
const testPort = 3006;
const baseUrl = `http://127.0.0.1:${testPort}`;
const stamp = Date.now();
let authCookie = '';

const serverProcess = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(testPort),
    MONGO_DB_NAME: testDatabaseName,
    JWT_SECRET: 'codex-site-analytics-test-secret',
  },
  stdio: 'ignore',
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authCookie && options.auth !== false) {
    headers.set('Cookie', authCookie);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie && options.auth !== false) {
    authCookie = setCookie.split(';')[0];
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json() : await response.text();
  return { response, data };
}

async function expectOk(path, options = {}) {
  const result = await request(path, options);
  if (!result.response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${path} -> ${result.response.status}: ${JSON.stringify(result.data)}`
    );
  }
  return result;
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await request('/healthz', { auth: false }).catch(() => null);
    if (health?.data?.database?.connected) {
      return;
    }
    await sleep(1000);
  }
  throw new Error('Test database was not ready.');
}

async function recordVisit(sessionId, forwardedIp, userAgent, referrer = '') {
  return request('/api/analytics/visit', {
    method: 'POST',
    auth: false,
    headers: {
      'X-Forwarded-For': forwardedIp,
      'User-Agent': userAgent,
    },
    body: JSON.stringify({
      sessionId,
      referrer,
      language: 'ar-YE',
    }),
  });
}

async function cleanup() {
  serverProcess.kill();
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: testDatabaseName,
    serverSelectionTimeoutMS: 10000,
  });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

async function run() {
  try {
    await waitForDatabase();

    await expectOk('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Analytics Test Admin',
        username: `analytics_admin_${stamp}`,
        password: `AnalyticsPassword${stamp}!`,
      }),
    });

    const unauthorized = await request('/api/analytics/overview', { auth: false });
    const desktopAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    const mobileAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile';

    const first = await recordVisit(`analytics_session_a_${stamp}`, '198.51.100.10', desktopAgent);
    const duplicate = await recordVisit(
      `analytics_session_a_${stamp}`,
      '198.51.100.10',
      desktopAgent
    );
    const secondSession = await recordVisit(
      `analytics_session_b_${stamp}`,
      '198.51.100.10',
      desktopAgent
    );
    const third = await recordVisit(
      `analytics_session_c_${stamp}`,
      '203.0.113.25',
      mobileAgent,
      'https://www.facebook.com/modernstarshipping/'
    );
    await recordVisit(`analytics_session_bot_${stamp}`, '203.0.113.90', 'Googlebot/2.1');

    const overview = await expectOk('/api/analytics/overview?days=30');

    await mongoose.connect(process.env.MONGO_URI, {
      dbName: testDatabaseName,
      serverSelectionTimeoutMS: 10000,
    });
    const storedVisits = await mongoose.connection.collection('sitevisits').find({}).toArray();
    await mongoose.disconnect();

    const assertions = {
      analyticsRequiresAuthentication: unauthorized.response.status === 401,
      publicTrackerAccepted:
        first.response.status === 204 &&
        duplicate.response.status === 204 &&
        secondSession.response.status === 204 &&
        third.response.status === 204,
      duplicateSessionIgnored: overview.data.totals?.visits === 3,
      uniqueVisitorsAreApproximate: overview.data.totals?.visitors === 2,
      recentPeriodTotalsAreCorrect:
        overview.data.totals?.todayVisits === 3 &&
        overview.data.totals?.last7Days === 3 &&
        overview.data.totals?.last30Days === 3,
      deviceBreakdownIsRecorded:
        overview.data.devices?.find((item) => item.type === 'desktop')?.visits === 2 &&
        overview.data.devices?.find((item) => item.type === 'mobile')?.visits === 1,
      referrerIsNormalized:
        overview.data.referrers?.find((item) => item.source === 'facebook.com')?.visits === 1,
      botsAreIgnored: storedVisits.length === 3,
      rawNetworkDataIsNotStored: storedVisits.every(
        (visit) =>
          !Object.prototype.hasOwnProperty.call(visit, 'ip') &&
          !Object.prototype.hasOwnProperty.call(visit, 'userAgent') &&
          /^[a-f0-9]{64}$/.test(visit.visitorHash)
      ),
      privateFieldsAreNotExposed: overview.data.recent?.every(
        (visit) => !visit.visitorHash && !visit.sessionHash && !visit.ip
      ),
    };

    console.log(JSON.stringify(assertions, null, 2));
    if (!Object.values(assertions).every(Boolean)) {
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
