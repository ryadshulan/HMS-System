const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function readEnvValue(name, fallback = '') {
  const rawValue = process.env[name];
  let value = rawValue == null || rawValue === '' ? fallback : String(rawValue);
  const assignmentPrefix = `${name}=`;

  value = value.trim().replace(/^\uFEFF/, '');

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  if (value.startsWith(assignmentPrefix)) {
    value = value.slice(assignmentPrefix.length).trim();
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

const app = express();
const uploadDir = path.join(__dirname, 'public', 'uploads');
const authCookieName = 'hms_token';
const isProduction = process.env.NODE_ENV === 'production';
const mongoUri = readEnvValue('MONGO_URI', 'mongodb://127.0.0.1:27017/hms');
const mongoDbName = readEnvValue('MONGO_DB_NAME');
const jwtSecret = readEnvValue('JWT_SECRET', 'change-this-in-production');
const jwtExpiresIn = readEnvValue('JWT_EXPIRES_IN', '7d');
const graphVersion = readEnvValue('META_GRAPH_VERSION', 'v24.0');
const defaultWhatsAppDeliveryMessage = 'وصلت شحنتك إلى مستودعات عدن بنجاح، شكراً لتعاملكم معنا.';
const whatsAppDefaultCountryCode = String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '967').replace(/\D/g, '');
const mongoServerSelectionTimeoutMs = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000);
const requireDatabase = process.env.REQUIRE_DB === 'true' || isProduction;
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 8;
const loginAttempts = new Map();
const maxShipmentHistoryItems = 50;
const milestoneDefinitions = [
  {
    key: 'originWarehouse',
    titleAr: 'مخازن الصين',
    icon: 'fa-warehouse',
    pendingEn: 'Loading at Origin Warehouse',
    completedEn: 'Loaded at Origin Warehouse',
    pendingAr: 'جاري تجهيز وتحميل الشحنة في المستودعات',
    completedAr: 'تم التحميل في مستودعات الصين',
  },
  {
    key: 'ningboPort',
    titleAr: 'ميناء نينغبو',
    icon: 'fa-truck-ramp-box',
    pendingEn: 'In-transit to Ningbo Port',
    completedEn: 'Gated-in at Ningbo Port',
    pendingAr: 'جاري نقل الحاوية إلى ميناء نينغبو',
    completedAr: 'وصلت الحاوية إلى ميناء نينغبو',
  },
  {
    key: 'loadingOnBoard',
    titleAr: 'التحميل للباخرة',
    icon: 'fa-ship',
    pendingEn: 'Waiting for Loading on Board',
    completedEn: 'Loaded on Board / Departed',
    pendingAr: 'جاري التحميل على متن السفينة',
    completedAr: 'تم التحميل ومغادرة السفينة',
  },
  {
    key: 'adenArrival',
    titleAr: 'وصول عدن',
    icon: 'fa-anchor',
    pendingEn: 'In-transit to Aden Port',
    completedEn: 'Vessel Arrived at Aden Port',
    pendingAr: 'الشحنة في الطريق إلى ميناء عدن',
    completedAr: 'وصلت السفينة إلى ميناء عدن',
  },
  {
    key: 'customsClearance',
    titleAr: 'التخليص الجمركي',
    icon: 'fa-file-signature',
    pendingEn: 'Customs Clearance in Progress',
    completedEn: 'Customs Cleared',
    pendingAr: 'بدء إجراءات التخليص الجمركي',
    completedAr: 'تم الإفراج الجمركي عن الشحنة',
  },
  {
    key: 'adenWarehouse',
    titleAr: 'مستودع عدن',
    icon: 'fa-box-open',
    pendingEn: 'Out for Delivery to Warehouse',
    completedEn: 'Delivered to Aden Warehouse',
    pendingAr: 'جاري النقل إلى المستودع النهائي',
    completedAr: 'تم الاستلام في مستودعات عدن',
  },
];
const finalMilestoneKey = milestoneDefinitions[milestoneDefinitions.length - 1].key;
const legacyStatusCompletionIndex = new Map([
  ['Loading at Origin Warehouse', -1],
  ['Loaded at Origin Warehouse', 0],
  ['In-transit to Ningbo Port', 0],
  ['Gated-in at Ningbo Port', 1],
  ['Waiting for Loading on Board', 1],
  ['Loaded on Board', 2],
  ['Loaded on Board / Departed', 2],
  ['Departed', 2],
  ['In-transit to Aden Port', 2],
  ['Arrived at Aden', 3],
  ['Vessel Arrived at Aden Port', 3],
  ['Customs Clearance in Progress', 3],
  ['Customs Cleared', 4],
  ['Out for Delivery to Warehouse', 4],
  ['Delivered to Aden Warehouse', 5],
  ['تم الاستلام في مستودعات الصين', 0],
  ['تم التحميل على السفينة', 2],
  ['في الطريق البحري', 2],
  ['وصلت ميناء عدن', 3],
  ['جاهزة للتسليم', 4],
]);

fs.mkdirSync(uploadDir, { recursive: true });

mongoose.set('bufferCommands', false);

let lastMongoConnectionError = '';

function setLastMongoConnectionError(error) {
  lastMongoConnectionError = error?.message ? String(error.message) : 'Unknown database connection error.';
}

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

function getDatabaseHealthPayload() {
  const readyStateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    connected: isDatabaseConnected(),
    readyState: mongoose.connection.readyState,
    state: readyStateMap[mongoose.connection.readyState] || 'unknown',
    requireDatabase,
    lastError: lastMongoConnectionError || null,
  };
}

if (mongoUri.includes('<db_password>')) {
  console.error('MONGO_URI still contains <db_password>. Replace it with the real MongoDB Atlas password in .env or Render env vars.');
  process.exit(1);
}

if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
  console.error(
    'Invalid MONGO_URI. In Render, put only the connection string value, starting with mongodb:// or mongodb+srv://. Do not include "MONGO_URI=" in the value field.'
  );
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set. A local fallback is being used. Set a strong secret before production.');
}

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://esm.sh",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
      "connect-src 'self' https://graph.facebook.com https://api.cloudinary.com https://res.cloudinary.com",
    ].join('; ')
  );
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

mongoose.connection.on('connected', () => {
  lastMongoConnectionError = '';
  console.log('MongoDB connection established.');
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. API endpoints will return 503 until connectivity is restored.');
});

mongoose.connection.on('error', (error) => {
  setLastMongoConnectionError(error);
  console.error('MongoDB runtime error:', error?.message || error);
});

mongoose
  .connect(mongoUri, {
    ...(mongoDbName ? { dbName: mongoDbName } : {}),
    serverSelectionTimeoutMS: Number.isFinite(mongoServerSelectionTimeoutMs)
      ? mongoServerSelectionTimeoutMs
      : 10000,
  })
  .then(() => console.log(`MongoDB Connected: ${mongoose.connection.name || mongoDbName || 'default'}`))
  .catch((error) => {
    setLastMongoConnectionError(error);
    console.error('MongoDB connection error:', error);
    if (requireDatabase) {
      process.exit(1);
    }
    console.warn(
      'Starting without database connectivity (development mode). Set REQUIRE_DB=true to fail fast instead.'
    );
  });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, callback) => {
    const safeName = file.originalname.replace(/[^\w.\u0600-\u06FF-]+/g, '-');
    callback(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'operator'], default: 'operator' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    container: { type: String, required: true, trim: true, uppercase: true },
    phone: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

const shipmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, uppercase: true, trim: true },
    location: { type: String, default: '', trim: true },
    updateNote: { type: String, default: '', trim: true },
    status: { type: String, default: '' },
    milestones: {
      type: mongoose.Schema.Types.Mixed,
      default: () => buildDefaultMilestones(),
    },
    history: {
      type: [
        new mongoose.Schema(
          {
            at: { type: Date, default: Date.now },
            actorId: String,
            actorName: String,
            note: String,
            location: String,
            statusAr: String,
            milestoneStates: mongoose.Schema.Types.Mixed,
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, minimize: false }
);

const newsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, default: '', trim: true },
    desc: { type: String, default: '', trim: true },
    image: { type: String, default: '', trim: true },
    imageProvider: { type: String, default: 'local', trim: true },
    imagePublicId: { type: String, default: '', trim: true },
    createdById: { type: String, default: '' },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    section: { type: String, required: true },
    details: { type: String, required: true },
    actorId: { type: String, default: '' },
    actorName: { type: String, default: 'system' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const notificationLogSchema = new mongoose.Schema(
  {
    shipmentId: { type: String, required: true, trim: true, uppercase: true },
    clientName: { type: String, required: true },
    phone: { type: String, required: true },
    message: { type: String, required: true },
    channel: { type: String, default: 'whatsapp' },
    status: { type: String, required: true },
    delivered: { type: Boolean, default: false },
    providerMessageId: { type: String, default: '' },
    providerResponse: { type: String, default: '' },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const User = mongoose.model('User', userSchema);
const Client = mongoose.model('Client', clientSchema);
const Shipment = mongoose.model('Shipment', shipmentSchema);
const News = mongoose.model('News', newsSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

function buildDefaultMilestones() {
  return milestoneDefinitions.reduce((accumulator, definition) => {
    accumulator[definition.key] = {
      completed: false,
      updatedAt: null,
    };
    return accumulator;
  }, {});
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTrackingId(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePhoneForWhatsApp(value) {
  let phone = String(value || '').trim().replace(/\D/g, '');

  if (phone.startsWith('00')) {
    phone = phone.slice(2);
  }

  if (whatsAppDefaultCountryCode && phone.startsWith('0')) {
    phone = `${whatsAppDefaultCountryCode}${phone.slice(1)}`;
  }

  if (
    whatsAppDefaultCountryCode &&
    phone.length <= 9 &&
    !phone.startsWith(whatsAppDefaultCountryCode)
  ) {
    phone = `${whatsAppDefaultCountryCode}${phone}`;
  }

  return phone;
}

function readMilestoneState(value, fallbackUpdatedAt = null) {
  if (typeof value === 'boolean') {
    return {
      completed: value,
      updatedAt: value ? fallbackUpdatedAt || new Date() : null,
    };
  }

  if (value && typeof value === 'object') {
    return {
      completed: Boolean(value.completed),
      updatedAt: value.completed ? value.updatedAt || fallbackUpdatedAt || new Date() : null,
    };
  }

  return {
    completed: false,
    updatedAt: null,
  };
}

function normalizeMilestones(input, legacyStatus = '', updatedAt = null) {
  const normalized = buildDefaultMilestones();

  if (input && typeof input === 'object') {
    milestoneDefinitions.forEach((definition) => {
      normalized[definition.key] = readMilestoneState(input[definition.key], updatedAt);
    });
  }

  const hasCompletedState = Object.values(normalized).some((state) => state.completed);
  if (!hasCompletedState) {
    const completionIndex = legacyStatusCompletionIndex.get(String(legacyStatus || '').trim()) ?? -1;
    milestoneDefinitions.forEach((definition, index) => {
      if (index <= completionIndex) {
        normalized[definition.key] = {
          completed: true,
          updatedAt: updatedAt || new Date(),
        };
      }
    });
  }

  return normalized;
}

function deriveShipmentStatus(milestones) {
  const firstIncompleteIndex = milestoneDefinitions.findIndex(
    (definition) => !Boolean(milestones[definition.key]?.completed)
  );

  if (firstIncompleteIndex === -1) {
    const lastDefinition = milestoneDefinitions[milestoneDefinitions.length - 1];
    return {
      key: lastDefinition.key,
      en: lastDefinition.completedEn,
      ar: lastDefinition.completedAr,
    };
  }

  const definition = milestoneDefinitions[firstIncompleteIndex];
  return {
    key: definition.key,
    en: definition.pendingEn,
    ar: definition.pendingAr,
  };
}

function buildMilestoneSequence(milestones) {
  const firstIncompleteIndex = milestoneDefinitions.findIndex(
    (definition) => !Boolean(milestones[definition.key]?.completed)
  );
  const currentIndex = firstIncompleteIndex === -1 ? milestoneDefinitions.length : firstIncompleteIndex;

  return milestoneDefinitions.map((definition, index) => {
    const state = milestones[definition.key] || {};
    const completed = Boolean(state.completed);
    const visualState = completed ? 'completed' : index === currentIndex ? 'current' : 'upcoming';

    return {
      ...definition,
      completed,
      visualState,
      updatedAt: state.updatedAt || null,
      labelAr: completed ? definition.completedAr : definition.pendingAr,
      labelEn: completed ? definition.completedEn : definition.pendingEn,
    };
  });
}

function serializeUser(userDocument) {
  return {
    _id: String(userDocument._id),
    name: userDocument.name,
    username: userDocument.username,
    role: userDocument.role,
    active: userDocument.active,
    createdAt: userDocument.createdAt,
    updatedAt: userDocument.updatedAt,
  };
}

function serializeShipment(document) {
  const shipment = document.toObject ? document.toObject() : document;
  const milestones = normalizeMilestones(shipment.milestones, shipment.status, shipment.updatedAt);
  const currentStatus = deriveShipmentStatus(milestones);

  return {
    _id: String(shipment._id),
    id: shipment.id,
    location: shipment.location || '',
    updateNote: shipment.updateNote || '',
    status: currentStatus.en,
    statusAr: currentStatus.ar,
    currentStageKey: currentStatus.key,
    milestones,
    milestoneSequence: buildMilestoneSequence(milestones),
    history: (shipment.history || []).slice(0, 20),
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      username: user.username,
      name: user.name,
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function setAuthCookie(res, token) {
  res.cookie(authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(authCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}

function getAuthToken(req) {
  if (req.cookies?.[authCookieName]) {
    return req.cookies[authCookieName];
  }

  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return '';
}

function getRateLimitKey(req, username = '') {
  return `${req.ip || 'unknown'}:${normalizeUsername(username)}`;
}

function registerFailedAttempt(key) {
  const attempt = loginAttempts.get(key) || { count: 0, firstAttemptAt: Date.now() };
  const now = Date.now();

  if (now - attempt.firstAttemptAt > loginWindowMs) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  attempt.count += 1;
  loginAttempts.set(key, attempt);
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

function isRateLimited(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt) {
    return false;
  }

  if (Date.now() - attempt.firstAttemptAt > loginWindowMs) {
    loginAttempts.delete(key);
    return false;
  }

  return attempt.count >= maxLoginAttempts;
}

async function writeAuditLog(action, section, details, actor = null, metadata = {}) {
  try {
    await AuditLog.create({
      action,
      section,
      details,
      actorId: actor?._id ? String(actor._id) : '',
      actorName: actor?.name || actor?.username || 'system',
      metadata,
    });
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}

async function ensureCloudinaryUpload(file) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folder = process.env.CLOUDINARY_FOLDER || 'hms';

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      url: `/uploads/${file.filename}`,
      provider: 'local',
      publicId: file.filename,
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = [
    folder ? `folder=${folder}` : '',
    `timestamp=${timestamp}`,
  ]
    .filter(Boolean)
    .join('&');
  const signature = crypto.createHash('sha1').update(`${signatureBase}${apiSecret}`).digest('hex');
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(file.path);

  formData.append('file', new Blob([fileBuffer], { type: file.mimetype }), file.originalname);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  if (folder) {
    formData.append('folder', folder);
  }
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Cloudinary upload failed.');
  }

  fs.unlink(file.path, () => {});

  return {
    url: data.secure_url,
    provider: 'cloudinary',
    publicId: data.public_id,
  };
}

async function destroyCloudinaryAsset(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret || !publicId) {
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);

  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body: formData,
  }).catch(() => {});
}

function renderMessageTemplate(template, client, shipment) {
  return String(template || '')
    .replaceAll('{name}', client.name || '')
    .replaceAll('{container}', shipment.id || '')
    .replaceAll('{trackingNumber}', shipment.id || '')
    .trim();
}

function buildClientNotificationMessage(client, shipment) {
  return renderMessageTemplate(
    process.env.WHATSAPP_DELIVERY_MESSAGE || defaultWhatsAppDeliveryMessage,
    client,
    shipment
  );
}

function buildWhatsAppPayload(client, shipment, message) {
  const to = normalizePhoneForWhatsApp(client.phone);
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  if (templateName) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar',
        },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: client.name },
              { type: 'text', text: shipment.id },
            ],
          },
        ],
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: message,
    },
  };
}

async function sendWhatsAppNotification(client, shipment) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const recipientPhone = normalizePhoneForWhatsApp(client.phone);
  const message = buildClientNotificationMessage(client, shipment);

  if (!phoneNumberId || !accessToken) {
    return {
      to: recipientPhone,
      message,
      delivered: false,
      status: 'not_configured',
      providerMessageId: '',
      providerResponse: 'Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN.',
      rawPayload: {},
    };
  }

  const payload = buildWhatsAppPayload(client, shipment, message);
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );
  const data = await response.json().catch(() => ({}));

  return {
    to: payload.to || recipientPhone,
    message,
    delivered: response.ok,
    status: response.ok ? 'accepted' : 'failed',
    providerMessageId: data?.messages?.[0]?.id || '',
    providerResponse: JSON.stringify(data).slice(0, 1000),
    rawPayload: data,
  };
}

async function dispatchDeliveryNotifications(shipment, actor) {
  const clients = await Client.find({ container: shipment.id }).sort({ createdAt: 1 });

  if (!clients.length) {
    await writeAuditLog(
      'تنبيه تلقائي',
      'الإشعارات',
      `لا يوجد عملاء مرتبطون بالحاوية ${shipment.id}`,
      actor,
      { shipmentId: shipment.id }
    );
    return [];
  }

  const results = [];

  for (const client of clients) {
    const deliveryResult = await sendWhatsAppNotification(client, shipment);
    const savedLog = await NotificationLog.create({
      shipmentId: shipment.id,
      clientName: client.name,
      phone: deliveryResult.to || client.phone,
      message: deliveryResult.message,
      channel: 'whatsapp',
      status: deliveryResult.status,
      delivered: deliveryResult.delivered,
      providerMessageId: deliveryResult.providerMessageId,
      providerResponse: deliveryResult.providerResponse,
      rawPayload: deliveryResult.rawPayload,
    });

    await writeAuditLog(
      'تنبيه تلقائي',
      'الإشعارات',
      `إشعار حاوية ${shipment.id} للعميل ${client.name}`,
      actor,
      {
        shipmentId: shipment.id,
        clientId: String(client._id),
        notificationId: String(savedLog._id),
        status: deliveryResult.status,
      }
    );

    results.push({
      _id: String(savedLog._id),
      clientName: client.name,
      phone: savedLog.phone,
      status: deliveryResult.status,
      delivered: deliveryResult.delivered,
      providerResponse: deliveryResult.providerResponse,
    });
  }

  return results;
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? '');
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function escapeXmlValue(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildClientExportRows(clients) {
  return clients.map((client, index) => ({
    '#': index + 1,
    'اسم العميل': client.name,
    'رقم الحاوية': client.container,
    'رقم الهاتف': client.phone,
    'ملاحظات': client.notes || '',
    'تاريخ الإضافة': client.createdAt ? new Date(client.createdAt).toLocaleDateString('ar-EG') : '',
  }));
}

function buildExcelWorkbook(rows) {
  const headers = Object.keys(
    rows[0] || {
      '#': '',
      'اسم العميل': '',
      'رقم الحاوية': '',
      'رقم الهاتف': '',
      'ملاحظات': '',
      'تاريخ الإضافة': '',
    }
  );

  const renderCell = (value) => `<Cell><Data ss:Type="String">${escapeXmlValue(value)}</Data></Cell>`;

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Clients">
  <Table>
   <Row>${headers.map((header) => renderCell(header)).join('')}</Row>
   ${rows
     .map((row) => `<Row>${headers.map((header) => renderCell(row[header])).join('')}</Row>`)
     .join('')}
  </Table>
 </Worksheet>
</Workbook>`;
}

async function requireAuth(req, res, next) {
  try {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = user;
    next();
  } catch (error) {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    next();
  };
}

function requireDbConnection(req, res, next) {
  if (isDatabaseConnected()) {
    return next();
  }

  return res.status(503).json({
    message: 'Database connection is not ready. Check MongoDB Atlas network access, credentials, and cluster status.',
    database: getDatabaseHealthPayload(),
  });
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true, database: getDatabaseHealthPayload() });
});

app.use('/api', (req, res, next) => {
  const isStaticConfigRoute = req.method === 'GET' && req.path === '/shipment-milestones';
  const isWhatsAppVerification = req.method === 'GET' && req.path === '/webhooks/whatsapp';

  if (isStaticConfigRoute || isWhatsAppVerification) {
    return next();
  }

  return requireDbConnection(req, res, next);
});

app.get('/api/auth/setup-status', async (req, res) => {
  const usersCount = await User.countDocuments();
  res.json({ needsSetup: usersCount === 0 });
});

app.post('/api/auth/bootstrap', async (req, res) => {
  const usersCount = await User.countDocuments();
  if (usersCount > 0) {
    return res.status(403).json({ message: 'System is already initialized.' });
  }

  const name = String(req.body?.name || '').trim();
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');

  if (!name || !username || password.length < 8) {
    return res.status(400).json({ message: 'Name, username and a password of at least 8 characters are required.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    username,
    passwordHash,
    role: 'admin',
  });

  await writeAuditLog('تهيئة النظام', 'المستخدمون', `تم إنشاء أول مدير للنظام: ${user.username}`, user);

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: serializeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const rateLimitKey = getRateLimitKey(req, username);

  if (isRateLimited(rateLimitKey)) {
    return res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
  }

  const user = await User.findOne({ username });
  if (!user || !user.active) {
    registerFailedAttempt(rateLimitKey);
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    registerFailedAttempt(rateLimitKey);
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  clearAttempts(rateLimitKey);
  const token = signToken(user);
  setAuthCookie(res, token);

  await writeAuditLog('تسجيل دخول', 'المصادقة', `دخول المستخدم ${user.username}`, user);
  res.json({ user: serializeUser(user) });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await writeAuditLog('تسجيل خروج', 'المصادقة', `خروج المستخدم ${req.user.username}`, req.user);
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

app.get('/api/users', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users.map((user) => serializeUser(user)));
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const role = ['admin', 'manager', 'operator'].includes(req.body?.role) ? req.body.role : 'operator';

  if (!name || !username || password.length < 8) {
    return res.status(400).json({ message: 'Name, username and a password of at least 8 characters are required.' });
  }

  const exists = await User.findOne({ username });
  if (exists) {
    return res.status(409).json({ message: 'Username already exists.' });
  }

  const user = await User.create({
    name,
    username,
    passwordHash: await bcrypt.hash(password, 12),
    role,
  });

  await writeAuditLog('إضافة', 'المستخدمون', `تمت إضافة المستخدم ${user.username}`, req.user, {
    userId: String(user._id),
  });

  res.status(201).json(serializeUser(user));
});

app.put('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  user.name = String(req.body?.name || user.name).trim();
  user.role = ['admin', 'manager', 'operator'].includes(req.body?.role) ? req.body.role : user.role;
  user.active = typeof req.body?.active === 'boolean' ? req.body.active : user.active;

  if (req.body?.password) {
    if (String(req.body.password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }
    user.passwordHash = await bcrypt.hash(String(req.body.password), 12);
  }

  await user.save();

  await writeAuditLog('تعديل', 'المستخدمون', `تم تعديل المستخدم ${user.username}`, req.user, {
    userId: String(user._id),
  });

  res.json(serializeUser(user));
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (String(req.user._id) === String(req.params.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  await writeAuditLog('حذف', 'المستخدمون', `تم حذف المستخدم ${user.username}`, req.user, {
    userId: String(user._id),
  });

  res.json({ ok: true });
});

app.get('/api/shipment-milestones', (req, res) => {
  res.json(milestoneDefinitions);
});

app.post('/api/media/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required.' });
  }

  try {
    const uploadResult = await ensureCloudinaryUpload(req.file);

    await writeAuditLog('رفع ملف', 'الوسائط', `تم رفع ملف ${req.file.originalname}`, req.user, {
      provider: uploadResult.provider,
    });

    res.json(uploadResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Upload failed.' });
  }
});

app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required.' });
  }

  try {
    const uploadResult = await ensureCloudinaryUpload(req.file);
    res.json({ url: uploadResult.url, provider: uploadResult.provider, publicId: uploadResult.publicId });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Upload failed.' });
  }
});

async function upsertShipmentRecord(req, res) {
  const trackingNumber = normalizeTrackingId(req.body?.trackingNumber);
  const location = String(req.body?.location || '').trim();
  const updateNote = String(req.body?.updateNote || '').trim();
  const milestones = normalizeMilestones(req.body?.milestones, req.body?.status, new Date());

  if (!trackingNumber) {
    return res.status(400).json({ message: 'Tracking number is required.' });
  }

  const existingShipment = await Shipment.findOne({ id: trackingNumber });
  const previousMilestones = normalizeMilestones(
    existingShipment?.milestones,
    existingShipment?.status,
    existingShipment?.updatedAt
  );
  const currentStatus = deriveShipmentStatus(milestones);

  const shipment = existingShipment || new Shipment({ id: trackingNumber });
  shipment.id = trackingNumber;
  shipment.location = location;
  shipment.updateNote = updateNote;
  shipment.status = currentStatus.en;
  shipment.milestones = milestones;
  shipment.history = shipment.history || [];
  shipment.history.unshift({
    at: new Date(),
    actorId: String(req.user._id),
    actorName: req.user.name,
    note: updateNote,
    location,
    statusAr: currentStatus.ar,
    milestoneStates: milestones,
  });
  shipment.history = shipment.history.slice(0, maxShipmentHistoryItems);
  await shipment.save();

  await writeAuditLog('حفظ/تحديث', 'الشحنات', `تم تحديث الشحنة ${trackingNumber}`, req.user, {
    trackingNumber,
    stageKey: currentStatus.key,
  });

  let notifications = [];
  const wasDelivered = Boolean(previousMilestones[finalMilestoneKey]?.completed);
  const isDelivered = Boolean(milestones[finalMilestoneKey]?.completed);
  if (!wasDelivered && isDelivered) {
    notifications = await dispatchDeliveryNotifications(shipment, req.user);
  }

  res.json({
    shipment: serializeShipment(shipment),
    notifications,
  });
}

async function deleteShipmentRecord(req, res) {
  const trackingNumber = normalizeTrackingId(req.params.trackingNumber);
  const shipment = await Shipment.findOneAndDelete({ id: trackingNumber });

  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found.' });
  }

  await writeAuditLog('حذف', 'الشحنات', `تم حذف الشحنة ${trackingNumber}`, req.user, {
    trackingNumber,
  });

  res.json({ ok: true });
}

app.get('/api/shipments', requireAuth, async (req, res) => {
  const shipments = await Shipment.find().sort({ updatedAt: -1 });
  res.json(shipments.map((shipment) => serializeShipment(shipment)));
});

app.post('/api/shipments', requireAuth, upsertShipmentRecord);

app.post('/api/shipment', requireAuth, upsertShipmentRecord);

app.get('/api/shipments/:trackingNumber', requireAuth, async (req, res) => {
  const trackingNumber = normalizeTrackingId(req.params.trackingNumber);
  const shipment = await Shipment.findOne({ id: trackingNumber });

  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found.' });
  }

  res.json(serializeShipment(shipment));
});

app.get('/api/shipment/:trackingNumber', async (req, res) => {
  const trackingNumber = normalizeTrackingId(req.params.trackingNumber);
  const shipment = await Shipment.findOne({ id: trackingNumber });

  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found.' });
  }

  res.json(serializeShipment(shipment));
});

app.delete('/api/shipments/:trackingNumber', requireAuth, deleteShipmentRecord);

app.delete('/api/shipment/:trackingNumber', requireAuth, deleteShipmentRecord);

app.get('/api/clients', requireAuth, async (req, res) => {
  const clients = await Client.find().sort({ createdAt: -1 });
  res.json(clients);
});

app.post('/api/clients', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const container = normalizeTrackingId(req.body?.container);
  const phone = String(req.body?.phone || '').trim();
  const notes = String(req.body?.notes || '').trim();

  if (!name || !container || !phone) {
    return res.status(400).json({ message: 'Name, container and phone are required.' });
  }

  const client = await Client.create({ name, container, phone, notes });

  await writeAuditLog('إضافة', 'العملاء', `تمت إضافة العميل ${name}`, req.user, {
    clientId: String(client._id),
  });

  res.status(201).json(client);
});

app.put('/api/clients/:id', requireAuth, async (req, res) => {
  const payload = {
    name: String(req.body?.name || '').trim(),
    container: normalizeTrackingId(req.body?.container),
    phone: String(req.body?.phone || '').trim(),
    notes: String(req.body?.notes || '').trim(),
  };

  if (!payload.name || !payload.container || !payload.phone) {
    return res.status(400).json({ message: 'Name, container and phone are required.' });
  }

  const client = await Client.findByIdAndUpdate(req.params.id, payload, { new: true });
  if (!client) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  await writeAuditLog('تعديل', 'العملاء', `تم تعديل العميل ${client.name}`, req.user, {
    clientId: String(client._id),
  });

  res.json(client);
});

app.delete('/api/clients/:id', requireAuth, async (req, res) => {
  const client = await Client.findByIdAndDelete(req.params.id);
  if (!client) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  await writeAuditLog('حذف', 'العملاء', `تم حذف العميل ${client.name}`, req.user, {
    clientId: String(client._id),
  });

  res.json({ ok: true });
});

app.get('/api/clients/export/csv', requireAuth, async (req, res) => {
  const clients = await Client.find().sort({ createdAt: 1 });
  const rows = buildClientExportRows(clients);
  const headers = Object.keys(rows[0] || { '#': '', 'اسم العميل': '', 'رقم الحاوية': '', 'رقم الهاتف': '', 'ملاحظات': '', 'تاريخ الإضافة': '' });
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ].join('\n');

  await writeAuditLog('تصدير', 'العملاء', `تم تصدير ${clients.length} عميل إلى CSV`, req.user, {
    count: clients.length,
    format: 'csv',
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="hms-clients-${Date.now()}.csv"`);
  res.send(`\ufeff${csv}`);
});

app.get('/api/clients/export/excel', requireAuth, async (req, res) => {
  const clients = await Client.find().sort({ createdAt: 1 });
  const workbook = buildExcelWorkbook(buildClientExportRows(clients));

  await writeAuditLog('تصدير', 'العملاء', `تم تصدير ${clients.length} عميل إلى Excel`, req.user, {
    count: clients.length,
    format: 'excel',
  });

  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="hms-clients-${Date.now()}.xls"`);
  res.send(`\ufeff${workbook}`);
});

app.get('/api/news', async (req, res) => {
  const news = await News.find().sort({ createdAt: -1 });
  res.json(news);
});

app.post('/api/news', requireAuth, async (req, res) => {
  const payload = {
    title: String(req.body?.title || '').trim(),
    date: String(req.body?.date || '').trim(),
    desc: String(req.body?.desc || '').trim(),
    image: String(req.body?.image || '').trim(),
    imageProvider: String(req.body?.imageProvider || 'local').trim(),
    imagePublicId: String(req.body?.imagePublicId || '').trim(),
    createdById: String(req.user._id),
    createdByName: req.user.name,
  };

  if (!payload.title) {
    return res.status(400).json({ message: 'Title is required.' });
  }

  const news = await News.create(payload);

  await writeAuditLog('إضافة', 'الأخبار', `تمت إضافة الخبر ${news.title}`, req.user, {
    newsId: String(news._id),
  });

  res.status(201).json(news);
});

app.put('/api/news/:id', requireAuth, async (req, res) => {
  const existing = await News.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: 'News item not found.' });
  }

  existing.title = String(req.body?.title || existing.title).trim();
  existing.date = String(req.body?.date || existing.date).trim();
  existing.desc = String(req.body?.desc || existing.desc).trim();

  const nextImage = String(req.body?.image || '').trim();
  const nextProvider = String(req.body?.imageProvider || existing.imageProvider || 'local').trim();
  const nextPublicId = String(req.body?.imagePublicId || '').trim();

  if (nextImage && nextImage !== existing.image) {
    if (existing.imageProvider === 'cloudinary' && existing.imagePublicId) {
      await destroyCloudinaryAsset(existing.imagePublicId);
    }
    existing.image = nextImage;
    existing.imageProvider = nextProvider;
    existing.imagePublicId = nextPublicId;
  }

  await existing.save();

  await writeAuditLog('تعديل', 'الأخبار', `تم تعديل الخبر ${existing.title}`, req.user, {
    newsId: String(existing._id),
  });

  res.json(existing);
});

app.delete('/api/news/:id', requireAuth, async (req, res) => {
  const news = await News.findByIdAndDelete(req.params.id);
  if (!news) {
    return res.status(404).json({ message: 'News item not found.' });
  }

  if (news.imageProvider === 'cloudinary' && news.imagePublicId) {
    await destroyCloudinaryAsset(news.imagePublicId);
  }

  await writeAuditLog('حذف', 'الأخبار', `تم حذف الخبر ${news.title}`, req.user, {
    newsId: String(news._id),
  });

  res.json({ ok: true });
});

app.get('/api/logs', requireAuth, async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200);
  res.json(logs);
});

app.get('/api/notifications', requireAuth, async (req, res) => {
  const notifications = await NotificationLog.find().sort({ createdAt: -1 }).limit(200);
  res.json(notifications);
});

app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post('/api/webhooks/whatsapp', async (req, res) => {
  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const statuses = change.value?.statuses || [];
      const messages = change.value?.messages || [];

      for (const status of statuses) {
        if (!status.id) {
          continue;
        }

        await NotificationLog.findOneAndUpdate(
          { providerMessageId: status.id },
          {
            $set: {
              status: status.status || 'updated',
              delivered: ['sent', 'delivered', 'read'].includes(status.status),
              providerResponse: JSON.stringify(status).slice(0, 1000),
              rawPayload: status,
            },
          }
        );
      }

      for (const message of messages) {
        await writeAuditLog(
          'وارد واتساب',
          'الإشعارات',
          `تم استلام رسالة واتساب من ${message.from || 'unknown'}`,
          null,
          { message }
        );
      }
    }
  }

  res.sendStatus(200);
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(error.status || 500).json({
    message: error.message || 'Unexpected server error.',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
