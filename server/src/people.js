import { Router } from 'express';
import { z } from 'zod';
import { collection, nextId } from './db.js';
import {
  asyncRoute, audit, fail, fullName, hashPassword, insertPerson,
  ok, parse, passwordSchema, personSchema, requireId,
  updatePerson, withTx,
} from './core.js';
import { role } from './auth.js';

const router = Router();

async function personRecord(account) {
  const person = await collection('personas').findOne({ id: account.persona_id });
  if (!person) return null;
  const { _id, id, ...fields } = person;
  return {
    cuenta_id: account.id,
    rol: account.rol,
    habilitada: account.habilitada,
    creada_en: account.creada_en,
    persona_id: id,
    ...fields,
    nombre: fullName(person),
  };
}

router.get('/staff', role('ADMIN'), asyncRoute(async (req, res) => {
  const accounts = await collection('cuentas').find({
    rol: { $in: ['ADMIN', 'BIBLIOTECARIO'] }, eliminada_en: null,
  }).sort({ id: -1 }).toArray();
  const rows = (await Promise.all(accounts.map(personRecord))).filter(Boolean);
  ok(res, rows);
}));

router.post('/staff', role('ADMIN'), asyncRoute(async (req, res) => {
  const data = parse(personSchema.extend({
    rol: z.enum(['ADMIN', 'BIBLIOTECARIO']),
    password: passwordSchema,
  }), req.body);
  const { rol, password, ...person } = data;
  const passwordHash = await hashPassword(password);
  const id = await withTx(async (session) => {
    const personId = await insertPerson(session, person);
    const accountId = await nextId('cuentas', session);
    await collection('cuentas').insertOne({
      id: accountId,
      persona_id: personId,
      email: person.email,
      password_hash: passwordHash,
      rol,
      habilitada: true,
      eliminada_en: null,
      ultimo_acceso: null,
      creada_en: new Date(),
    }, { session });
    await audit(session, req.user.id, 'CREAR', 'empleados', accountId, { rol });
    return accountId;
  });
  ok(res, { id }, 201);
}));

router.patch('/staff/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  const data = parse(personSchema.extend({
    rol: z.enum(['ADMIN', 'BIBLIOTECARIO']),
    password: passwordSchema.optional(),
  }), req.body);
  const { rol, password, ...person } = data;
  const passwordHash = password ? await hashPassword(password) : null;

  await withTx(async (session) => {
    const account = await collection('cuentas').findOne({
      id,
      rol: { $in: ['ADMIN', 'BIBLIOTECARIO'] },
      eliminada_en: null,
    }, { session });
    if (!account) fail(404, 'Empleado no encontrado');
    if (id === req.user.id && rol !== account.rol) {
      fail(409, 'No puedes cambiar tu propio rol');
    }
    if (account.rol === 'ADMIN' && rol !== 'ADMIN') {
      const admins = await collection('cuentas').countDocuments({
        rol: 'ADMIN',
        habilitada: true,
        eliminada_en: null,
      }, { session });
      if (admins <= 1) fail(409, 'Debe quedar al menos un administrador activo');
    }
    await updatePerson(session, account.persona_id, person);
    await collection('cuentas').updateOne({ id }, {
      $set: {
        email: person.email,
        rol,
        ...(passwordHash ? { password_hash: passwordHash } : {}),
      },
    }, { session });
    if (passwordHash || rol !== account.rol) {
      await collection('sesiones').updateMany(
        { cuenta_id: id }, { $set: { revocada_en: new Date() } }, { session },
      );
    }
    await audit(session, req.user.id, 'EDITAR', 'empleados', id, { rol });
  });
  ok(res, { mensaje: 'Empleado actualizado' });
}));

router.delete('/staff/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  if (id === req.user.id) fail(409, 'No puedes eliminar tu propia cuenta');
  await withTx(async (session) => {
    const account = await collection('cuentas').findOne({
      id,
      rol: { $in: ['ADMIN', 'BIBLIOTECARIO'] },
      eliminada_en: null,
    }, { session });
    if (!account) fail(404, 'Empleado no encontrado');
    if (account.rol === 'ADMIN') {
      const admins = await collection('cuentas').countDocuments({
        rol: 'ADMIN',
        habilitada: true,
        eliminada_en: null,
      }, { session });
      if (admins <= 1) fail(409, 'No se puede eliminar al último administrador');
    }
    await collection('cuentas').updateOne({ id }, {
      $set: { habilitada: false, eliminada_en: new Date() },
    }, { session });
    await collection('sesiones').updateMany(
      { cuenta_id: id }, { $set: { revocada_en: new Date() } }, { session },
    );
    await audit(session, req.user.id, 'BAJA_LOGICA', 'empleados', id);
  });
  ok(res, { mensaje: 'Empleado eliminado lógicamente' });
}));

router.get('/affiliates', role('ADMIN', 'BIBLIOTECARIO'), asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().toLocaleLowerCase('es-MX');
  if (q.length > 100) fail(422, 'Búsqueda demasiado larga');
  const accounts = await collection('cuentas').find({
    rol: 'AFILIADO', eliminada_en: null,
  }).sort({ id: -1 }).limit(500).toArray();
  const rows = [];

  for (const account of accounts) {
    const person = await personRecord(account);
    const affiliate = await collection('afiliados').findOne({ cuenta_id: account.id });
    if (!person || !affiliate) continue;
    if (q && !`${person.nombre} ${account.email}`.toLocaleLowerCase('es-MX').includes(q)) {
      continue;
    }
    const activeLoans = await collection('prestamos').countDocuments({
      afiliado_id: account.id, devuelto_en: null,
    });
    rows.push({
      ...person,
      estatus: affiliate.estatus,
      verificacion: affiliate.verificacion,
      documento_tipo: affiliate.documento_tipo,
      verificado_en: affiliate.verificado_en,
      prestamos_activos: activeLoans,
    });
    if (rows.length >= 200) break;
  }
  ok(res, rows);
}));

router.patch('/affiliates/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  const data = parse(z.object({
    estatus: z.enum(['ACTIVO', 'PENALIZADO', 'BAJA']),
    verificacion: z.enum(['PENDIENTE', 'VERIFICADO', 'RECHAZADO']),
    documento_tipo: z.enum(['INE', 'PASAPORTE', 'OTRO']).nullable().optional(),
  }).strict(), req.body);

  await withTx(async (session) => {
    const old = await collection('afiliados').findOne({ cuenta_id: id }, { session });
    if (!old) fail(404, 'Afiliado no encontrado');
    const loans = await collection('prestamos').find({
      afiliado_id: id, devuelto_en: null,
    }, { session }).toArray();
    if (data.estatus === 'ACTIVO' && loans.some((loan) => loan.vence_en < new Date())) {
      fail(409, 'El afiliado tiene préstamos vencidos; registra las devoluciones');
    }
    if (data.estatus === 'BAJA' && loans.length) {
      fail(409, 'No puedes dar de baja un afiliado con préstamos activos');
    }
    const documentType = data.documento_tipo === undefined
      ? old.documento_tipo
      : data.documento_tipo;
    if (data.verificacion === 'VERIFICADO' && !documentType) {
      fail(422, 'Selecciona el documento de identidad presentado');
    }

    await collection('afiliados').updateOne({ cuenta_id: id }, {
      $set: {
        estatus: data.estatus,
        verificacion: data.verificacion,
        documento_tipo: documentType,
        verificado_por: data.verificacion === 'VERIFICADO' ? req.user.id : null,
        verificado_en: data.verificacion === 'VERIFICADO' ? new Date() : null,
      },
    }, { session });

    if (data.estatus === 'BAJA') {
      const reservations = await collection('reservaciones').find({
        afiliado_id: id, estatus: 'ACTIVA',
      }, { session }).toArray();
      for (const reservation of reservations) {
        await collection('reservaciones').updateOne(
          { id: reservation.id, estatus: 'ACTIVA' },
          { $set: { estatus: 'CANCELADA', terminada_en: new Date() } },
          { session },
        );
        await collection('ejemplares').updateOne(
          { id: reservation.ejemplar_id, estatus: 'RESERVADO' },
          { $set: { estatus: 'DISPONIBLE' } },
          { session },
        );
      }
    }
    await audit(session, req.user.id, 'ACTUALIZAR_ESTADO', 'afiliados', id, data);
  });
  ok(res, { mensaje: 'Afiliado actualizado' });
}));

export default router;
