import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { router } from './routes.js';
import { getSetting, setSetting } from './db.js';

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = process.env.NAHAYAT_DATA_DIR ?? '/data';
const SESSION_DIR = path.join(DATA_DIR, 'sessions');
fs.mkdirSync(SESSION_DIR, { recursive: true });

// Persist the session secret across container restarts so the customer doesn't
// get logged out on every redeploy. Generated once on first run.
function loadSessionSecret(): string {
  const existing = getSetting('session_secret');
  if (existing) return existing;
  const fresh = crypto.randomBytes(48).toString('base64');
  setSetting('session_secret', fresh);
  return fresh;
}

const SQLiteStore = SQLiteStoreFactory(session);
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(
  session({
    store: new (SQLiteStore as any)({ db: 'sessions.sqlite', dir: SESSION_DIR }) as session.Store,
    secret: loadSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 3600_000,
    },
  }),
);

app.use('/api', router);

// Serve the built React UI in production. In dev, Vite serves it on :5173
// with /api proxied here.
const webDir = path.resolve(import.meta.dirname ?? __dirname, '../web');
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[nahayat-pentest] portal listening on :${PORT} (data=${DATA_DIR})`);
});
