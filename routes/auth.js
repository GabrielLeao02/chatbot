// routes/auth.js
const express = require('express');
const router = express.Router();

/**
 * Espera receberem estes campos do LydiaClient via setState():
 *   state.lastQR        -> string do QR (bruto)
 *   state.lastQrPng     -> data:image/png;base64,...
 *   state.lastQrAt      -> ISO
 *   state.ready         -> boolean (cliente pronto)
 *   state.wid           -> número do Whats conectado (se houver)
 *   state.pushname      -> nome da conta (se houver)
 */
module.exports = function buildAuthRoutes(state, clientCtl) {
  // status JSON
  router.get('/status', (req, res) => {
    res.json({
      botid: state.botid,
      ready: !!state.ready,
      wid: state.wid || null,
      pushname: state.pushname || null,
      lastQrAt: state.lastQrAt || null,
      hasQr: !!state.lastQR,
      port: state.port
    });
  });

  // QR como JSON (inclui DataURL se quiser exibir em <img>)
  router.get('/qr', (req, res) => {
    if (!state.lastQR) return res.status(404).json({ error: 'QR não disponível ainda' });
    res.json({
      botid: state.botid,
      lastQrAt: state.lastQrAt,
      qr: state.lastQR,
      pngDataUrl: state.lastQrPng || null
    });
  });

  // QR como imagem PNG (útil pro navegador/Postman visualizar)
  router.get('/qr.png', (req, res) => {
    if (!state.lastQrPng) return res.status(404).send('QR não disponível');
    const base64 = state.lastQrPng.split(',')[1];
    const buf = Buffer.from(base64, 'base64');
    res.set('Content-Type', 'image/png');
    res.send(buf);
  });

  // Forçar reinicialização (opcionalmente limpando sessão)
  router.post('/restart', async (req, res) => {
    const wipe = String(req.query.wipe || 'false').toLowerCase() === 'true';
    try {
      await clientCtl.restart({ wipe });
      res.json({ ok: true, wipe });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
