# Campfire Courtyard MVP

A lightweight browser-based social world where friends gather around a virtual campfire. The current build already supports first-person exploration, shared avatar presence, and spatial voice chat via WebRTC. The Node/Vite toolchain is in place for further iteration.

## Tech Stack

- **Client:** JavaScript, Vite, Three.js (for upcoming 3D scene), WebRTC + Web Audio (voice + spatial audio).
- **Server:** Node.js, Express (static hosting + REST), `ws` (WebSocket signalling), in-memory room manager.

Each main entry file includes a short comment describing the stack decisions.

## Current Features

- Cozy dusk courtyard rendered with Three.js plus first-person WASD + mouse look (now with hopping!).
- Multiplayer state sync over WebSockets with simple capsule avatars, animated legs/arms, and name tags.
- Proximity voice powered by WebRTC + Web Audio, including a stereo fallback toggle.
- Light combat loop: left-click to swing, deal damage, and knock hearts off nearby friends; respawn after being downed.
- Minimal HUD with player list, mic controls, and heart UI showing the six-hit health pool.

## Getting Started

1. Install Node.js 18+.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the HTTP/WebSocket server:

   ```bash
   npm run dev:server
   ```

4. In a separate terminal, start the Vite dev server:

   ```bash
   npm run dev:client
   ```

5. Open the client in your browser at [http://localhost:5173](http://localhost:5173). The API/WebSocket server listens on [http://localhost:3000](http://localhost:3000) with the `/ws` path reserved for realtime connections.

## Build for Production

```bash
npm run build
npm start
```

- `npm run build` outputs a static bundle to `dist/`.
- `npm start` serves the built assets from Express and attaches the WebSocket server.

## Next Steps

Remaining MVP polish:

1. Refine UI/UX (name tags, mute button state, player list styling tweaks).
2. Add quality-of-life touches (ambient audio loop, simple emote, connection diagnostics).

The codebase stays modular: check `client/world/`, `client/network/`, `client/audio/`, and `client/ui/` (overlay/hud logic lives in `client/main.js`) for entry points.
