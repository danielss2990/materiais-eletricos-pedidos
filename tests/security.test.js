/**
 * TESTES DE SEGURANÇA DA API (HTTP)
 * Sobe o servidor Express em porta aleatória com banco e anexos isolados em diretório temporário.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Ambiente isolado: precisa ser definido antes de carregar config/banco
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-sec-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.ATTACHMENT_STORAGE_DIR = path.join(tmpDir, 'attachments');
process.env.WEBHOOK_TOKEN = 'token_de_teste_ci';
process.env.N8N_WEBHOOK_SECRET = 'segredo_n8n_de_teste_ci';
process.env.WHATSAPP_API_TOKEN = '';
process.env.WHATSAPP_APP_SECRET = '';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = '';

const config = require('../backend/src/config');
const db = require('../backend/src/database/connection');
const seed = require('../backend/src/database/seed');
const app = require('../backend/src/server');

let server;
let baseUrl;

before(async () => {
  seed();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

function request(urlPath, { method = 'GET', headers = {}, body } = {}) {
  return fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

async function login(username, password) {
  const res = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.strictEqual(res.status, 200, `login de ${username} deve funcionar`);
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  const data = await res.json();
  return { cookie, token: data.token };
}

// ----------------------------------------------------------------------------
// AUTENTICAÇÃO
// ----------------------------------------------------------------------------

test('rotas protegidas exigem autenticação', async () => {
  const res = await request('/api/orders');
  assert.strictEqual(res.status, 401);
});

test('ID de usuário não é aceito como token', async () => {
  const res = await request('/api/orders', { headers: { Authorization: 'Bearer usr_admin' } });
  assert.strictEqual(res.status, 401);
});

test('login com senha errada é rejeitado', async () => {
  const res = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'errada' } });
  assert.strictEqual(res.status, 401);
});

test('login define cookie HttpOnly e o cookie autentica', async () => {
  const res = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  const setCookie = res.headers.get('set-cookie') || '';
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);

  const cookie = setCookie.split(';')[0];
  const me = await request('/api/auth/me', { headers: { Cookie: cookie } });
  assert.strictEqual(me.status, 200);
  assert.strictEqual((await me.json()).user.role, 'ADMIN');
});

test('token Bearer da sessão autentica', async () => {
  const { token } = await login('admin', 'admin123');
  const res = await request('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(res.status, 200);
});

test('perfil sem permissão recebe 403', async () => {
  const { cookie } = await login('vendedor1', 'vendas123');
  const res = await request('/api/auth/users', { headers: { Cookie: cookie } });
  assert.strictEqual(res.status, 403);
});

test('logout invalida a sessão', async () => {
  const { cookie } = await login('admin', 'admin123');
  await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
  const res = await request('/api/auth/me', { headers: { Cookie: cookie } });
  assert.strictEqual(res.status, 401);
});

test('senhas são armazenadas com scrypt', () => {
  const user = db.get('SELECT password_hash FROM users WHERE username = ?', ['admin']);
  assert.match(user.password_hash, /^scrypt\$/);
});

test('hash legado SHA-256 é aceito e migrado no login', async () => {
  const legacy = crypto.createHash('sha256').update('cotacao123').digest('hex');
  db.run('UPDATE users SET password_hash = ? WHERE username = ?', [legacy, 'analista1']);

  await login('analista1', 'cotacao123');
  const user = db.get('SELECT password_hash FROM users WHERE username = ?', ['analista1']);
  assert.match(user.password_hash, /^scrypt\$/);
});

// ----------------------------------------------------------------------------
// WEBHOOKS
// ----------------------------------------------------------------------------

const emailPayload = () => ({
  messageId: `<teste_${crypto.randomBytes(6).toString('hex')}@cliente.com>`,
  from: 'cliente@exemplo.com',
  fromName: 'Cliente Teste',
  subject: 'Pedido',
  bodyText: '2 disjuntor de 20 monopolar'
});

test('webhook de e-mail sem token é rejeitado', async () => {
  const res = await request('/api/webhooks/email', { method: 'POST', body: emailPayload() });
  assert.strictEqual(res.status, 401);
});

test('webhook de e-mail com token errado é rejeitado', async () => {
  const res = await request('/api/webhooks/email', {
    method: 'POST',
    headers: { 'X-Webhook-Token': 'errado' },
    body: emailPayload()
  });
  assert.strictEqual(res.status, 401);
});

const n8nPayload = () => ({
  externalId: `wam_ci_${crypto.randomBytes(6).toString('hex')}`,
  senderPhone: '+5511999990000',
  text: '1 passa-fio'
});

test('webhook do n8n sem segredo é rejeitado', async () => {
  const res = await request('/api/webhooks/n8n/whatsapp', { method: 'POST', body: n8nPayload() });
  assert.strictEqual(res.status, 401);
});

test('webhook do n8n com segredo errado é rejeitado', async () => {
  const res = await request('/api/webhooks/n8n/whatsapp', {
    method: 'POST',
    headers: { 'X-Webhook-Secret': 'errado' },
    body: n8nPayload()
  });
  assert.strictEqual(res.status, 401);
});

test('webhook do n8n não aceita sessão de usuário no lugar do segredo', async () => {
  const { cookie } = await login('admin', 'admin123');
  const res = await request('/api/webhooks/n8n/whatsapp', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: n8nPayload()
  });
  assert.strictEqual(res.status, 401);
});

test('webhook do n8n aceita segredo válido', async () => {
  const res = await request('/api/webhooks/n8n/whatsapp', {
    method: 'POST',
    headers: { 'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET },
    body: n8nPayload()
  });
  assert.strictEqual(res.status, 200);
});

test('webhook do n8n rejeita tudo quando o segredo não está configurado', async () => {
  const original = config.whatsapp.n8nWebhookSecret;
  config.whatsapp.n8nWebhookSecret = '';
  try {
    const res = await request('/api/webhooks/n8n/whatsapp', {
      method: 'POST',
      headers: { 'X-Webhook-Secret': '' },
      body: n8nPayload()
    });
    assert.strictEqual(res.status, 401);
  } finally {
    config.whatsapp.n8nWebhookSecret = original;
  }
});

test('simulação do n8n no painel exige login', async () => {
  const res = await request('/api/integrations/n8n/simulate', { method: 'POST', body: n8nPayload() });
  assert.strictEqual(res.status, 401);
});

test('webhook da Meta sem App Secret configurado rejeita qualquer assinatura', async () => {
  const body = { entry: [] };
  const signature = 'sha256=' + crypto.createHmac('sha256', 'app_secret_meta_2026').update(JSON.stringify(body)).digest('hex');
  const res = await request('/api/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'X-Hub-Signature-256': signature },
    body
  });
  assert.strictEqual(res.status, 401);
});

test('handshake da Meta sem verify token configurado é rejeitado', async () => {
  const res = await request('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=token_verificacao_meta_webhook_2026&hub.challenge=123');
  assert.strictEqual(res.status, 403);
});

// ----------------------------------------------------------------------------
// ANEXOS
// ----------------------------------------------------------------------------

test('nome de anexo com path traversal fica dentro da pasta de anexos', async () => {
  const res = await request('/api/webhooks/email', {
    method: 'POST',
    headers: { 'X-Webhook-Token': process.env.WEBHOOK_TOKEN },
    body: {
      ...emailPayload(),
      attachments: [{
        filename: '/../../../evil.js',
        mimeType: 'text/html',
        base64Content: Buffer.from('<script>alert(1)</script>').toString('base64')
      }]
    }
  });
  assert.strictEqual(res.status, 200);
  const { order_id: orderId } = await res.json();

  const att = db.get('SELECT * FROM attachments WHERE order_id = ?', [orderId]);
  const attachmentsDir = path.resolve(config.storage.attachmentsDir);
  assert.ok(path.resolve(att.file_path).startsWith(attachmentsDir + path.sep), 'arquivo deve ficar dentro da pasta de anexos');
  assert.ok(!fs.existsSync(path.join(tmpDir, 'evil.js')));
  assert.ok(!fs.existsSync(path.resolve(attachmentsDir, '..', '..', 'evil.js')));

  // HTML enviado pelo remetente nunca é servido inline com o tipo original
  const { cookie } = await login('admin', 'admin123');
  const file = await request(`/api/files/${att.id}`, { headers: { Cookie: cookie } });
  assert.strictEqual(file.status, 200);
  assert.strictEqual(file.headers.get('content-type'), 'application/octet-stream');
  assert.match(file.headers.get('content-disposition'), /^attachment;/);
  assert.strictEqual(file.headers.get('x-content-type-options'), 'nosniff');
  await file.arrayBuffer();
});

test('download de anexo exige autenticação', async () => {
  const att = db.get('SELECT id FROM attachments LIMIT 1');
  const res = await request(`/api/files/${att.id}`);
  assert.strictEqual(res.status, 401);
});
