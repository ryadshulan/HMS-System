const { spawn } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config({ quiet: true });

const testDatabaseName = 'hms_codex_milestones_test';
const testPort = 3003;
const baseUrl = `http://127.0.0.1:${testPort}`;
const stamp = Date.now();
const trackingNumber = `DATE-${stamp}`;
let authCookie = '';

const serverProcess = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(testPort),
    MONGO_DB_NAME: testDatabaseName,
    JWT_SECRET: 'codex-milestone-test-secret',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
  },
  stdio: 'ignore',
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authCookie) {
    headers.set('Cookie', authCookie);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    authCookie = setCookie.split(';')[0];
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await request('/healthz').catch(() => null);
    if (health?.database?.connected) {
      return;
    }
    await sleep(1000);
  }
  throw new Error('Test database was not ready.');
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
    await request('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Date Test Admin',
        username: `date_admin_${stamp}`,
        password: `DateTest${stamp}!`,
      }),
    });

    const definitions = await request('/api/shipment-milestones');
    const initialMilestones = Object.fromEntries(
      definitions.map((stage) => [
        stage.key,
        { manualCompleted: false, estimatedDate: '' },
      ])
    );
    initialMilestones.originWarehouse.estimatedDate = '2020-01-01';
    initialMilestones.ningboPort.estimatedDate = '2099-01-01';

    const created = await request('/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        trackingNumber,
        location: 'China',
        milestones: initialMilestones,
      }),
    });

    const delayedMilestones = structuredClone(initialMilestones);
    delayedMilestones.originWarehouse.estimatedDate = '2099-02-01';
    const delayed = await request('/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        trackingNumber,
        location: 'China',
        milestones: delayedMilestones,
      }),
    });

    const manualMilestones = Object.fromEntries(
      definitions.map((stage) => [
        stage.key,
        { manualCompleted: false, estimatedDate: '2099-12-31' },
      ])
    );
    manualMilestones.loadingOnBoard.manualCompleted = true;
    const manual = await request('/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        trackingNumber,
        location: 'Ningbo',
        milestones: manualMilestones,
      }),
    });
    const publicView = await request(`/api/shipment/${trackingNumber}`);
    const adenTitle = definitions.find((stage) => stage.key === 'adenArrival')?.titleAr;

    const assertions = {
      automaticCompletion:
        created.shipment.milestones.originWarehouse.completed === true &&
        created.shipment.milestones.originWarehouse.autoCompleted === true,
      currentAfterAutomaticCompletion:
        created.shipment.currentStageKey === 'ningboPort',
      delayedDateRevertedStage:
        delayed.shipment.milestones.originWarehouse.completed === false &&
        delayed.shipment.currentStageKey === 'originWarehouse',
      manualCompletionPropagatedSequentially:
        ['originWarehouse', 'ningboPort', 'loadingOnBoard'].every(
          (key) => manual.shipment.milestones[key].completed
        ),
      manualCompletionPreserved:
        manual.shipment.milestones.loadingOnBoard.manualCompleted === true,
      publicViewContainsEstimatedDate:
        publicView.milestones.loadingOnBoard.estimatedDate === '2099-12-31',
      adenPortTitleUpdated: adenTitle === 'وصول ميناء عدن',
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
