const crypto = require('crypto');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config({ quiet: true });

const testDatabaseName = 'hms_codex_whatsapp_test';
const testPort = 3005;
const baseUrl = `http://127.0.0.1:${testPort}`;
const stamp = Date.now();
const trackingNumber = `WA-${stamp}`;
const webhookSecret = 'codex-meta-app-secret';
const webhookVerifyToken = 'codex-webhook-verify-token';
let authCookie = '';

const serverProcess = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(testPort),
    MONGO_DB_NAME: testDatabaseName,
    JWT_SECRET: 'codex-whatsapp-test-secret',
    META_APP_SECRET: webhookSecret,
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    WHATSAPP_VERIFY_TOKEN: webhookVerifyToken,
    WHATSAPP_TEMPLATE_NAME: 'hello',
    WHATSAPP_TEMPLATE_LANGUAGE: 'en',
    WHATSAPP_TEMPLATE_BODY_PARAMETERS: '',
  },
  stdio: 'ignore',
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(path, options = {}, expectedStatus = null) {
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
  if (expectedStatus !== null) {
    if (response.status !== expectedStatus) {
      throw new Error(
        `${options.method || 'GET'} ${path} -> ${response.status}, expected ${expectedStatus}: ${JSON.stringify(data)}`
      );
    }
    return { response, data };
  }
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
        name: 'WhatsApp Test Admin',
        username: `whatsapp_admin_${stamp}`,
        password: `WhatsAppTest${stamp}!`,
      }),
    });

    const client = await request('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'CRM Test Client',
        container: trackingNumber,
        phone: '0777 123 456',
        whatsappOptIn: false,
      }),
    });

    const duplicate = await request(
      '/api/clients',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Duplicate Client',
          container: trackingNumber,
          phone: '967777123456',
          whatsappOptIn: false,
        }),
      },
      409
    );

    const definitions = await request('/api/shipment-milestones');
    const milestones = Object.fromEntries(
      definitions.map((stage) => [
        stage.key,
        { manualCompleted: stage.key === 'adenWarehouse', estimatedDate: '' },
      ])
    );
    const completedShipment = await request('/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        trackingNumber,
        location: 'Aden Warehouse',
        milestones,
      }),
    });

    const optedInClient = await request(`/api/clients/${client._id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...client,
        whatsappOptIn: true,
      }),
    });
    const retry = await request(`/api/shipments/${trackingNumber}/notifications`, {
      method: 'POST',
    });
    const status = await request('/api/whatsapp/status');

    const webhookBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'test-waba',
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  {
                    id: `wamid.${stamp}`,
                    from: client.phone,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'أين أستلم الشحنة؟' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const unsignedWebhook = await request(
      '/api/webhooks/whatsapp',
      {
        method: 'POST',
        body: webhookBody,
      },
      401
    );
    const signature = `sha256=${crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookBody)
      .digest('hex')}`;
    const signedWebhook = await request(
      '/api/webhooks/whatsapp',
      {
        method: 'POST',
        headers: { 'X-Hub-Signature-256': signature },
        body: webhookBody,
      },
      200
    );
    const inboundMessages = await request('/api/whatsapp/messages');

    const assertions = {
      phoneNormalized: client.phone === '967777123456',
      optInDefaultsToFalse: client.whatsappOptIn === false,
      duplicateContainerPhoneRejected:
        duplicate.response.status === 409,
      noOptInSkipped:
        completedShipment.notifications?.[0]?.status === 'skipped_no_opt_in',
      optInTimestampRecorded:
        optedInClient.whatsappOptIn === true && Boolean(optedInClient.whatsappOptInAt),
      retryUsesSafeConfigurationFailure:
        retry.notifications?.[0]?.status === 'not_configured',
      statusDoesNotExposeSecrets:
        status.configured === false &&
        !Object.prototype.hasOwnProperty.call(status, 'accessToken'),
      unsignedWebhookRejected: unsignedWebhook.response.status === 401,
      signedWebhookAccepted: signedWebhook.response.status === 200,
      inboundMessageLinkedToClient:
        inboundMessages?.[0]?.clientId === String(client._id) &&
        inboundMessages?.[0]?.text === 'أين أستلم الشحنة؟',
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
