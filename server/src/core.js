import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { collection, nextId, withTransaction } from './db.js';

export { inDays, inHours, normalizeISBN, isValidISBN, newISBN } from './domain.js';

export const config = {
  port: Number(process.env.PORT || 4000),
  production: process.env.NODE_ENV === 'production',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => {
  throw new ApiError(status, message);
};
export const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
export const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve().then(() => handler(req, res, next)).catch(next);
};
export const withTx = withTransaction;

export function requireId(raw) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'Identificador no válido');
  return id;
}

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    fail(422, `${issue.path.join('.') || 'Campo'}: ${issue.message}`);
  }
  return result.data;
}

export function plain(document) {
  if (!document) return null;
  const { _id, ...rest } = document;
  return rest;
}

export function fullName(person) {
  return [
    person.primer_nombre,
    person.segundo_nombre,
    person.apellido_paterno,
    person.apellido_materno,
  ].filter(Boolean).join(' ');
}

const optionalText = (max = 150) => z.union([
  z.string().trim().max(max),
  z.null(),
]).optional().transform((text) => text || null);

function validBirthDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && date <= new Date();
}

export const personSchema = z.object({
  primer_nombre: z.string().trim().min(2).max(80),
  segundo_nombre: optionalText(80),
  apellido_paterno: z.string().trim().min(2).max(80),
  apellido_materno: optionalText(80),
  genero: z.enum([
    'MUJER', 'HOMBRE', 'NO_BINARIO', 'OTRO', 'PREFIERO_NO_DECIR',
  ]).default('PREFIERO_NO_DECIR'),
  fecha_nacimiento: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validBirthDate),
    z.null(),
  ]).optional().transform((value) => value || null),
  domicilio: optionalText(240),
  codigo_postal: optionalText(12),
  ciudad: optionalText(100),
  estado: optionalText(100),
  pais: z.string().trim().min(2).max(100).default('México'),
  email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()),
  telefono: optionalText(25),
  fotografia: optionalText(255),
}).strict();

export const passwordSchema = z.string()
  .min(10, 'Al menos 10 caracteres')
  .max(128)
  .regex(/[A-ZÁÉÍÓÚ]/, 'Incluye una mayúscula')
  .regex(/[a-záéíóú]/, 'Incluye una minúscula')
  .regex(/\d/, 'Incluye un número');

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function checkPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, salt, hex] = String(encoded).split('$');
    if (algorithm !== 'scrypt' || !/^[a-f0-9]{128}$/.test(hex)) return false;
    const original = Buffer.from(hex, 'hex');
    const candidate = await scrypt(password, Buffer.from(salt, 'hex'), 64, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 32 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(original, candidate);
  } catch {
    return false;
  }
}

export const rawToken = () => crypto.randomBytes(32).toString('hex');
export const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function insertPerson(session, raw) {
  const person = parse(personSchema, raw);
  const id = await nextId('personas', session);
  await collection('personas').insertOne(
    {
      id,
      ...person,
      fecha_registro: new Date()
    },
    { session },
  );
  return id;
}

export async function updatePerson(session, id, raw) {
  const person = parse(personSchema, raw);
  const result = await collection('personas').updateOne(
    { id: requireId(id) }, { $set: person }, { session },
  );
  if (!result.matchedCount) fail(404, 'Persona no encontrada');
  return person;
}

export async function audit(session, actor, action, entity, entityId, detail = null) {
  const id = await nextId('auditoria', session);
  await collection('auditoria').insertOne({
    id,
    actor_id: actor || null,
    accion: action,
    entidad: entity,
    entidad_id: entityId || null,
    detalle: detail,
    creado_en: new Date(),
  }, session ? { session } : {});
}

export async function getAccountPerson(account, session) {
  const person = await collection('personas').findOne(
    { id: account.persona_id }, session ? { session } : {},
  );
  return person;
}

export async function eligible(session, rawId) {
  const id = requireId(rawId);
  const options = session ? { session } : {};
  const affiliate = await collection('afiliados').findOne({ cuenta_id: id }, options);
  const account = await collection('cuentas').findOne({ id }, options);

  if (!affiliate || !account) fail(404, 'Afiliado no encontrado');
  if (!account.habilitada || account.eliminada_en || affiliate.estatus !== 'ACTIVO') {
    fail(409, 'El afiliado debe tener estatus Activo');
  }
  if (affiliate.verificacion !== 'VERIFICADO') {
    fail(409, 'El afiliado debe verificar su identidad en la biblioteca');
  }
  const overdue = await collection('prestamos').countDocuments({
    afiliado_id: id,
    devuelto_en: null,
    vence_en: { $lt: new Date() },
  }, options);
  if (overdue) fail(409, 'El afiliado tiene préstamos vencidos');
  return affiliate;
}

export async function refreshStatuses() {
  const now = new Date();
  await withTransaction(async (session) => {
    const expired = await collection('reservaciones').find({
      estatus: 'ACTIVA', vence_en: { $lte: now },
    }, { session }).toArray();

    for (const reservation of expired) {
      await collection('reservaciones').updateOne(
        { id: reservation.id, estatus: 'ACTIVA' },
        { $set: { estatus: 'EXPIRADA', terminada_en: now } },
        { session },
      );
      const loan = await collection('prestamos').findOne({
        ejemplar_id: reservation.ejemplar_id, devuelto_en: null,
      }, { session });
      if (!loan) {
        await collection('ejemplares').updateOne(
          { id: reservation.ejemplar_id, estatus: 'RESERVADO' },
          { $set: { estatus: 'DISPONIBLE' } },
          { session },
        );
      }
    }

    const overdueLoans = await collection('prestamos')
      .find(
        {
          devuelto_en: null,
          vence_en: { $lt: now },
        },
        {
          session,
          projection: { afiliado_id: 1 },
        },
      )
      .toArray();

    const overdueIds = [
      ...new Set(overdueLoans.map((loan) => loan.afiliado_id)),
    ];

    if (overdueIds.length) {
      await collection('afiliados').updateMany(
        { cuenta_id: { $in: overdueIds }, estatus: 'ACTIVO' },
        { $set: { estatus: 'PENALIZADO' } },
        { session },
      );
    }
  });
}
