const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const privacyPolicy = fs.readFileSync(
  path.join(rootDir, 'public', 'privacy-policy.html'),
  'utf8'
);
const dataDeletion = fs.readFileSync(
  path.join(rootDir, 'public', 'data-deletion.html'),
  'utf8'
);
const server = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

assert.match(
  privacyPolicy,
  /<link rel="canonical" href="https:\/\/hmstar\.net\/privacy-policy">/
);
assert.match(
  dataDeletion,
  /<link rel="canonical" href="https:\/\/hmstar\.net\/data-deletion">/
);
assert.match(privacyPolicy, /id="arabic"/);
assert.match(privacyPolicy, /id="english"/);
assert.match(dataDeletion, /id="arabic"/);
assert.match(dataDeletion, /id="english"/);
assert.match(privacyPolicy, /info@hmstar\.net/g);
assert.match(dataDeletion, /info@hmstar\.net/g);
assert.match(privacyPolicy, /WhatsApp Cloud API/);
assert.match(privacyPolicy, /Meta Graph API/);
assert.match(privacyPolicy, /MongoDB Atlas/);
assert.match(privacyPolicy, /Render/);
assert.match(privacyPolicy, /لا نبيع بياناتك الشخصية/);
assert.match(dataDeletion, /طلب حذف بيانات/);
assert.match(dataDeletion, /User Data Deletion Request/);
assert.match(server, /app\.get\(\['\/privacy-policy', '\/privacy-policy\/'\]/);
assert.match(server, /app\.get\(\['\/data-deletion', '\/data-deletion\/'\]/);

console.log('Legal pages unit test passed.');
