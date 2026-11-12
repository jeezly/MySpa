import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectDB, createIndexes, closeDB, getDB } from './db.js';
import { ApiError, asyncRoute, config, ok, refreshStatuses } from './core.js';
import authRoutes, { authentication, csrfGuard } from './auth.js';
import catalogRoutes from './catalog.js';
import peopleRoutes from './people.js';
import circulationRoutes from './circulation.js';
import mediaRoutes from './media.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    },
  },
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const host = req.get('host');
    const allowed = new Set([
      config.webOrigin,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      `http://${host}`,
      `https://${host}`,
    ]);
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      return next(new ApiError(403, 'Origen no permitido'));
    }
  }
  next();
});

app.use('/api', authentication, csrfGuard);
app.get('/api/health', asyncRoute(async (req, res) => {
  await getDB().command({ ping: 1 });
  ok(res, { servicio: 'MySpa API', database: 'conectada' });
}));
app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/circulation', circulationRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api', (req, res, next) => next(new ApiError(404, 'Ruta no encontrada')));

const clientDist = resolve(import.meta.dirname, '../../client/dist');
if (config.production && existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '7d' }));
  app.get('*', (req, res) => res.sendFile(resolve(clientDist, 'index.html')));
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let message = error.message || 'Error inesperado';

  if (error.code === 11000) {
    status = 409;
    message = 'El correo, ISBN, nombre o código ya está registrado';
  }
  if (error.name === 'MulterError') {
    status = 422;
    message = error.code === 'LIMIT_FILE_SIZE'
      ? 'La imagen debe pesar menos de 2 MB'
      : 'Archivo no válido';
  }
  if (['MongoServerSelectionError', 'MongoNetworkError'].includes(error.name)) {
    status = 503;
    message = 'No se pudo conectar a MongoDB Atlas';
  }
  if (status >= 500) {
    console.error('[API]', error);
    message = 'Error interno del servidor. Revisa la terminal de la API.';
  }
  res.status(status).json({ ok: false, error: message });
});

async function main() {
  try {
    await connectDB();
    await createIndexes();
    await refreshStatuses();
  } catch (error) {
    console.error('[ATLAS] No se pudo iniciar MySpa:', error.message);
    await closeDB();
    process.exitCode = 1;
    return;
  }

  const server = app.listen(config.port, () => {
    console.log(`MySpa API lista en http://localhost:${config.port}`);
  });
  const worker = setInterval(() => {
    refreshStatuses().catch((error) => console.error('[VIGILANCIA]', error.message));
  }, 60_000);
  worker.unref();

  async function shutdown() {
    clearInterval(worker);
    server.close();
    await closeDB();
    process.exit(0);
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main();
