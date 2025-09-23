'use strict';

function index(req, res) {
  const botType = process.env.BOT_TYPE || 'Lydia';
  const botID = process.env.BOT_ID || null;

  res.json({
    ok: true,
    service: 'Lydia Bot',
    botType,
    botId: botID,
    uptimeSeconds: process.uptime()
  });
}

module.exports = {
  index
};
