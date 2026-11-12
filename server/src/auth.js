import crypto from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { collection, nextId } from './db.js';
import {
  ApiError, asyncRoute, audit, checkPassword, digest, fail,
  getAccountPerson, hashPassword, insertPerson, ok, parse,
  passwordSchema, personSchema, rawToken, withTx,
} from './core.js';

const router = Router();
const cookieName = 'myspa_session';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && process.env.LOCAL_HTTP !== 'true',
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 86_400_000,
};

const loginRate = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Intenta más tarde.' },
});

const registerRate = rateLimit({
  windowMs: 60 * 60_000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados registros desde esta conexión.' },
});

function serialize(account, person, affiliate) {
  return {
    id: account.id,
    rol: account.rol,
    email: account.email,
    nombre: person.primer_nombre,
    apellido: person.apellido_paterno,
    fotografia: person.fotografia,
    estatus: affiliate?.estatus || null,
    verificacion: affiliate?.verificacion || null,
  };
}

async function loadUser(account) {
  const person = await getAccountPerson(account);
  if (!person) return null;
  const affiliate = account.rol === 'AFILIADO'
    ? await collection('afiliados').findOne({ cuenta_id: account.id })
    : null;
  return serialize(account, person, affiliate);
}

export const authentication = asyncRoute(async (req, res, next) => {
  const token = req.cookies?.[cookieName];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return next();

  const session = await collection('sesiones').findOne({
    token_hash: digest(token),
    revocada_en: null,
    expira_en: { $gt: new Date() },
  });
  if (!session) return next();

  const account = await collection('cuentas').findOne({
    id: session.cuenta_id,
    habilitada: true,
    eliminada_en: null,
  });
  if (!account) return next();

  req.user = await loadUser(account);
  req.sessionId = session.id;
  req.csrfToken = session.csrf_token;
  next();
});

export const requireAuth = (req, res, next) => req.user
  ? next()
  : next(new ApiError(401, 'Inicia sesión para continuar'));

export const role = (...allowed) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Inicia sesión para continuar'));
  if (!allowed.includes(req.user.rol)) {
    return next(new ApiError(403, 'No tienes permiso para realizar esta acción'));
  }
  next();
};

export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
    ['/auth/login', '/auth/register'].includes(req.path)) return next();
  if (!req.user) return next(new ApiError(401, 'Inicia sesión para continuar'));

  const token = req.get('x-csrf-token');
  if (!token || !req.csrfToken ||
    token.length !== req.csrfToken.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.csrfToken))) {
    return next(new ApiError(403, 'Token CSRF inválido; actualiza la página'));
  }
  next();
}

router.post('/register', registerRate, asyncRoute(async (req, res) => {
  const { password, ...person } = parse(
    personSchema.extend({ password: passwordSchema }), req.body,
  );
  const passwordHash = await hashPassword(password);

  const accountId = await withTx(async (session) => {
    const personId = await insertPerson(session, person);
    const id = await nextId('cuentas', session);
    await collection('cuentas').insertOne({
      id,
      persona_id: personId,
      email: person.email,
      password_hash: passwordHash,
      rol: 'AFILIADO',
      habilitada: true,
      eliminada_en: null,
      ultimo_acceso: null,
      creada_en: new Date(),
    }, { session });
    await collection('afiliados').insertOne({
      cuenta_id: id,
      estatus: 'ACTIVO',
      verificacion: 'PENDIENTE',
      documento_tipo: null,
      verificado_por: null,
      verificado_en: null,
    }, { session });
    await audit(session, id, 'REGISTRO', 'afiliados', id);
    return id;
  });

  ok(res, {
    id: accountId,
    mensaje: 'Registro completo. Presenta una identificación en la biblioteca para habilitar tus reservaciones.',
  }, 201);
}));

router.post('/login', loginRate, asyncRoute(async (req, res) => {
  const { email, password } = parse(z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
  }).strict(), req.body);

  const account = await collection('cuentas').findOne({ email: email.toLowerCase() });
  const valid = account ? await checkPassword(password, account.password_hash) : false;
  if (!valid || !account.habilitada || account.eliminada_en) {
    fail(401, 'Correo o contraseña incorrectos');
  }

  const token = rawToken();
  const csrfToken = rawToken();
  const id = await nextId('sesiones');
  await collection('sesiones').insertOne({
    id,
    cuenta_id: account.id,
    token_hash: digest(token),
    csrf_token: csrfToken,
    creada_en: new Date(),
    expira_en: new Date(Date.now() + cookieOptions.maxAge),
    revocada_en: null,
  });
  await collection('cuentas').updateOne(
    { id: account.id }, { $set: { ultimo_acceso: new Date() } },
  );

  res.cookie(cookieName, token, cookieOptions);
  ok(res, { user: await loadUser(account), csrfToken });
}));

router.get('/me', asyncRoute(async (req, res) => {
  ok(res, { user: req.user || null, csrfToken: req.csrfToken || null });
}));

router.post('/logout', requireAuth, asyncRoute(async (req, res) => {
  await collection('sesiones').updateOne(
    { id: req.sessionId }, { $set: { revocada_en: new Date() } },
  );
  res.clearCookie(cookieName, {
    path: '/',
    sameSite: 'strict',
    secure: cookieOptions.secure,
  });
  ok(res, { mensaje: 'Sesión cerrada' });
}));

router.get('/profile', requireAuth, asyncRoute(async (req, res) => {
  const account = await collection('cuentas').findOne({ id: req.user.id });
  const person = await getAccountPerson(account);
  const affiliate = await collection('afiliados').findOne({ cuenta_id: account.id });
  const { _id, id, ...fields } = person;
  ok(res, {
    persona_id: id,
    ...fields,
    rol: account.rol,
    estatus: affiliate?.estatus || null,
    verificacion: affiliate?.verificacion || null,
  });
}));

router.patch('/profile', requireAuth, asyncRoute(async (req, res) => {
  const changes = parse(personSchema.omit({ email: true }).partial().strict(), req.body);
  if (!Object.keys(changes).length) fail(422, 'No hay cambios');
  await withTx(async (session) => {
    const account = await collection('cuentas').findOne(
      { id: req.user.id }, { session },
    );
    await collection('personas').updateOne(
      { id: account.persona_id }, { $set: changes }, { session },
    );
    await audit(session, req.user.id, 'PERFIL_EDITADO', 'cuentas', account.id);
  });
  ok(res, { mensaje: 'Perfil actualizado' });
}));

router.patch('/password', requireAuth, asyncRoute(async (req, res) => {
  const { actual, nueva } = parse(z.object({
    actual: z.string().min(1), nueva: passwordSchema,
  }).strict(), req.body);
  const account = await collection('cuentas').findOne({ id: req.user.id });
  if (!await checkPassword(actual, account.password_hash)) {
    fail(422, 'La contraseña actual no es correcta');
  }
  const passwordHash = await hashPassword(nueva);
  await withTx(async (session) => {
    await collection('cuentas').updateOne(
      { id: account.id }, { $set: { password_hash: passwordHash } }, { session },
    );
    await collection('sesiones').updateMany(
      { cuenta_id: account.id, id: { $ne: req.sessionId } },
      { $set: { revocada_en: new Date() } }, { session },
    );
    await audit(session, account.id, 'PASSWORD_CAMBIADA', 'cuentas', account.id);
  });
  ok(res, { mensaje: 'Contraseña actualizada' });
}));

export default router;
