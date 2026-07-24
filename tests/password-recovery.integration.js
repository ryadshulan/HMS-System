const { spawn } = require('child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ quiet: true });

const testDatabaseName = 'hms_codex_password_recovery_test';
const testPort = 3005;
const baseUrl = `http://127.0.0.1:${testPort}`;
const stamp = Date.now();
const username = `recovery_admin_${stamp}`;
const oldPassword = `OldRecoveryPassword${stamp}!`;
const newPassword = `NewRecoveryPassword${stamp}!`;
const testCode = '654321';
let authCookie = '';

const serverProcess = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(testPort),
    MONGO_DB_NAME: testDatabaseName,
    JWT_SECRET: 'codex-password-recovery-test-secret',
    PASSWORD_RESET_TEST_MODE: 'true',
    PASSWORD_RESET_TEST_CODE: testCode,
    WHATSAPP_PASSWORD_RESET_ENABLED: 'true',
    WHATSAPP_PASSWORD_RESET_TEMPLATE_NAME: 'hms_password_reset',
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
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
        name: 'Recovery Test Admin',
        username,
        password: oldPassword,
        recoveryEmail: 'admin@example.com',
        recoveryPhone: '967784790005',
      }),
    });

    const oldCookie = authCookie;
    const config = await expectOk('/api/auth/recovery-config', { auth: false });
    const forgot = await expectOk('/api/auth/forgot-password', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, channel: 'whatsapp' }),
    });

    await mongoose.connect(process.env.MONGO_URI, {
      dbName: testDatabaseName,
      serverSelectionTimeoutMS: 10000,
    });
    const resetRecord = await mongoose.connection.collection('passwordresets').findOne({
      requestId: forgot.data.requestId,
    });
    const codeStoredAsHash =
      Boolean(resetRecord?.codeHash) &&
      resetRecord.codeHash !== testCode &&
      (await bcrypt.compare(testCode, resetRecord.codeHash));
    await mongoose.disconnect();

    const wrongCode = await request('/api/auth/reset-password', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({
        requestId: forgot.data.requestId,
        code: '111111',
        newPassword,
      }),
    });

    const reset = await expectOk('/api/auth/reset-password', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({
        requestId: forgot.data.requestId,
        code: testCode,
        newPassword,
      }),
    });

    authCookie = oldCookie;
    const oldSession = await request('/api/auth/me');
    authCookie = '';
    const oldLogin = await request('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password: oldPassword }),
    });
    const newLogin = await expectOk('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password: newPassword }),
    });
    const replay = await request('/api/auth/reset-password', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({
        requestId: forgot.data.requestId,
        code: testCode,
        newPassword: `${newPassword}Again`,
      }),
    });

    const assertions = {
      whatsappRecoveryAdvertised: config.data.channels.whatsapp === true,
      emailRecoveryAdvertisedInTestMode: config.data.channels.email === true,
      resetCodeStoredAsHash: codeStoredAsHash,
      wrongCodeRejected: wrongCode.response.status === 400,
      passwordResetSucceeded: reset.data.ok === true && reset.data.username === username,
      previousJwtSessionRevoked: oldSession.response.status === 401,
      oldPasswordRejected: oldLogin.response.status === 401,
      newPasswordAccepted: newLogin.data.user?.username === username,
      resetCodeCannotBeReused: replay.response.status === 400,
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
