'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { handleConnection } = require('./lib/ws-handler');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'ai-doll-server' }));
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', handleConnection);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[ai-doll] Server running on port ${PORT}`);
  console.log(`[ai-doll] WebSocket: ws://localhost:${PORT}/ws`);
});
