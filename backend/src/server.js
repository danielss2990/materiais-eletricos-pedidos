const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const config = require('./config');
const db = require('./database/connection');
const { authMiddleware } = require('./middlewares/authMiddleware');

const authRoutes = require('./routes/authRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const integrationsRoutes = require('./routes/integrationsRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

// Garante inicialização do banco de dados relacional
db.getRawDb();

// Middlewares Globais
app.use(cors());

// Middleware especial para capturar rawBody para validação de assinatura criptográfica de webhooks
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf, encoding) => {
    if (req.originalUrl && req.originalUrl.startsWith('/api/webhooks')) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ----------------------------------------------------------------------------
// STREAMING SEGURO DE ANEXOS PRIVADOS (Fora do web root público)
// ----------------------------------------------------------------------------
app.get('/api/files/:id', authMiddleware(), (req, res) => {
  const { id } = req.params;
  const attachment = db.get('SELECT * FROM attachments WHERE id = ?', [id]);

  if (!attachment || !fs.existsSync(attachment.file_path)) {
    return res.status(404).json({ error: 'Arquivo não encontrado ou acesso não autorizado.' });
  }

  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);
  const stream = fs.createReadStream(attachment.file_path);
  stream.pipe(res);
});

// ----------------------------------------------------------------------------
// ROTAS DA API REST
// ----------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/webhooks', webhookRoutes);

// ----------------------------------------------------------------------------
// FRONTEND INTERNO (HTML5, CSS3 e JS Modular)
// ----------------------------------------------------------------------------
const frontendDir = path.resolve(__dirname, '..', '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));

  // Rota fallback para navegação no frontend SPA
  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

// Tratamento de erros centralizado
app.use((err, req, res, next) => {
  console.error('[App Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno no servidor.',
    timestamp: new Date().toISOString()
  });
});

if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`================================================================`);
    console.log(`⚡ SISTEMA DE PROCESSAMENTO DE PEDIDOS — MATERIAIS ELÉTRICOS ⚡`);
    console.log(`Servidor ativo em: http://localhost:${config.port}`);
    console.log(`Ambiente: ${config.env} | Banco: ${config.database.driver} (${config.database.sqlitePath})`);
    console.log(`Motor de IA: ${config.ai.provider}`);
    console.log(`================================================================`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nEncerrando servidor...');
    server.close(() => {
      console.log('Servidor finalizado com segurança.');
      process.exit(0);
    });
  });
}

module.exports = app;
