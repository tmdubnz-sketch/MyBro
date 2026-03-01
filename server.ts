import express from "express";
import { createServer as createViteServer } from "vite";
import http from 'http';

const PORT = parseInt(process.env.PORT || "3000", 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

async function startServer() {
  const app = express();

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM — shutting down...');
    httpServer.close(() => {
      console.log('[Server] Done');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8_000);
  });
}

startServer();
