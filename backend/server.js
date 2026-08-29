const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'troque-este-token';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'access-requests.json');

// --- e-mail (Gmail) ---
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || GMAIL_USER;

let mailer = null;
if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
} else {
  console.warn('Aviso: GMAIL_USER / GMAIL_APP_PASSWORD não configurados — notificações por e-mail estão desativadas.');
}

const willingnessLabels = { sim: 'Sim', talvez: 'Talvez, dependendo do valor', nao: 'Não' };

async function sendNotificationEmail(reqData) {
  if (!mailer || !NOTIFY_EMAIL) return;

  const subject = `Nova solicitação de acesso — ${reqData.nome} (${reqData.role})`;
  const text = [
    `Nome: ${reqData.nome}`,
    `E-mail: ${reqData.email}`,
    `LinkedIn: ${reqData.linkedin || '—'}`,
    `Tipo: ${reqData.role}`,
    `Pagaria pelo acesso: ${willingnessLabels[reqData.willingness] || reqData.willingness}`,
    `Valor considerado justo: ${reqData.fairPrice || '—'}`,
    `Data: ${new Date(reqData.createdAt).toLocaleString('pt-BR')}`,
  ].join('\n');

  try {
    await mailer.sendMail({
      from: `Rede Profissional Privada <${GMAIL_USER}>`,
      to: NOTIFY_EMAIL,
      subject,
      text,
    });
  } catch (err) {
    console.error('Falha ao enviar e-mail de notificação:', err.message);
  }
}

// --- setup ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');

app.use(cors());
app.use(express.json());

// --- helpers ---
function readRequests() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function writeRequests(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  next();
}

// --- rate limiting (simple in-memory, per IP) ---
const submissionLog = new Map(); // ip -> timestamp[]
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (submissionLog.get(ip) || []).filter(t => now - t < WINDOW_MS);
  timestamps.push(now);
  submissionLog.set(ip, timestamps);
  return timestamps.length > MAX_PER_WINDOW;
}

// --- routes ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Public: submit an access request
app.post('/api/access-requests', (req, res) => {
  const ip = req.ip;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas solicitações. Tente novamente em instantes.' });
  }

  const { nome, email, linkedin, role, willingness, fairPrice } = req.body || {};

  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  if (!role || !['profissional', 'empresa'].includes(role)) {
    return res.status(400).json({ error: 'Tipo de acesso inválido.' });
  }
  if (!willingness || !['sim', 'talvez', 'nao'].includes(willingness)) {
    return res.status(400).json({ error: 'Resposta sobre disposição de pagamento é obrigatória.' });
  }

  const requests = readRequests();

  const alreadyExists = requests.some(
    r => r.email.toLowerCase() === email.toLowerCase()
  );
  if (alreadyExists) {
    return res.status(409).json({ error: 'Este e-mail já está na lista de interesse.' });
  }

  const newRequest = {
    id: crypto.randomUUID(),
    nome: nome.trim(),
    email: email.trim().toLowerCase(),
    linkedin: (linkedin || '').trim(),
    role,
    willingness, // sim | talvez | nao
    fairPrice: willingness === 'nao' ? '' : (fairPrice || '').trim(),
    status: 'pendente', // pendente | aprovado | recusado
    createdAt: new Date().toISOString(),
  };

  requests.push(newRequest);
  writeRequests(requests);

  res.status(201).json({ ok: true, id: newRequest.id });

  // Envia a notificação depois de responder ao usuário, sem atrasar o formulário
  sendNotificationEmail(newRequest);
});

// Admin: list all requests (protected by token)
app.get('/api/access-requests', requireAdmin, (req, res) => {
  const requests = readRequests();
  const { role, status } = req.query;

  let filtered = requests;
  if (role) filtered = filtered.filter(r => r.role === role);
  if (status) filtered = filtered.filter(r => r.status === status);

  res.json({
    total: filtered.length,
    requests: filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  });
});

// Admin: update a request's status (approve/reject)
app.patch('/api/access-requests/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['pendente', 'aprovado', 'recusado'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const requests = readRequests();
  const idx = requests.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Solicitação não encontrada.' });

  requests[idx].status = status;
  writeRequests(requests);

  res.json({ ok: true, request: requests[idx] });
});

// Admin: export as CSV
app.get('/api/access-requests/export.csv', requireAdmin, (req, res) => {
  const requests = readRequests();
  const header = 'id,nome,email,linkedin,role,willingness,fairPrice,status,createdAt\n';
  const rows = requests
    .map(r => [r.id, r.nome, r.email, r.linkedin, r.role, r.willingness, r.fairPrice, r.status, r.createdAt]
      .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
      .join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="solicitacoes-acesso.csv"');
  res.send(header + rows);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Admin token atual: ${ADMIN_TOKEN}`);
});
