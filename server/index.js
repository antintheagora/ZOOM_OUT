// Stack: Node.js + Express + ws (WebSocket) to serve static client code and realtime signalling.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms/roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ?? 3000;

const staticDir = path.resolve(__dirname, '../dist');
app.use(express.static(staticDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const rooms = new RoomManager();

wss.on('connection', (socket) => {
  const player = rooms.addPlayer(socket);
  socket.send(
    JSON.stringify({
      type: 'welcome',
      payload: { id: player.id }
    })
  );

  socket.on('message', (raw) => rooms.handleMessage(player.id, raw));
  socket.on('close', () => rooms.removePlayer(player.id));
  socket.on('error', (err) => {
    console.error('Socket error', err);
    rooms.removePlayer(player.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Campfire server listening on http://localhost:${PORT}`);
});
