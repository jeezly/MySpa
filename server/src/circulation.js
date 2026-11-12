import { Router } from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { collection, nextId } from './db.js';
import {
  asyncRoute, audit, eligible, fail, fullName, inDays, inHours,
  ok, parse, plain, refreshStatuses, requireId, withTx,
} from './core.js';
import { requireAuth, role } from './auth.js';

const router = Router();
const staff = role('ADMIN', 'BIBLIOTECARIO');
const positiveId = z.coerce.number().int().positive();

async function details(record, kind) {
  const copy = await collection('ejemplares').findOne({ id: record.ejemplar_id });
  const book = copy && await collection('libros').findOne({ id: copy.libro_id });
  const account = await collection('cuentas').findOne({ id: record.afiliado_id });
  const person = account && await collection('personas').findOne({ id: account.persona_id });
  if (!copy || !book || !person) return null;

  if (kind === 'loan') {
    return {
      ...plain(record),
      titulo: book.titulo,
      codigo: copy.codigo,
      afiliado: fullName(person),
      estatus: record.devuelto_en
        ? 'DEVUELTO'
        : record.vence_en < new Date() ? 'VENCIDO' : 'ACTIVO',
    };
  }
  return {
    ...plain(record),
    titulo: book.titulo,
    codigo: copy.codigo,
    afiliado: fullName(person),
  };
}

async function notifyReservation(email, title, until) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'MySpa | Reservación confirmada',
      text: `Tu reservación de "${title}" está confirmada. Vence: ${new Date(until).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}.`,
    });
  } catch (error) {
    console.error('[EMAIL]', error.message);
  }
}

router.get('/reservations', requireAuth, asyncRoute(async (req, res) => {
  await refreshStatuses();
  const filter = req.user.rol === 'AFILIADO'
    ? { afiliado_id: req.user.id }
    : {};
  const reservations = await collection('reservaciones').find(filter)
    .sort({ creada_en: -1 }).limit(250).toArray();
  const items = (await Promise.all(reservations.map(
    (item) => details(item, 'reservation'),
  ))).filter(Boolean);
  ok(res, items);
}));

router.post('/reservations', role('AFILIADO'), asyncRoute(async (req, res) => {
  const { libro_id: bookId } = parse(z.object({ libro_id: positiveId }), req.body);
  await refreshStatuses();
  const saved = await withTx(async (session) => {
    await eligible(session, req.user.id);
    const book = await collection('libros').findOne(
      { id: bookId, activo: true }, { session },
    );
    if (!book) fail(404, 'Libro no encontrado');

    const existing = await collection('reservaciones').findOne({
      afiliado_id: req.user.id,
      libro_id: bookId,
      estatus: 'ACTIVA',
    }, { session });
    if (existing) fail(409, 'Ya tienes una reservación activa para este título');

    // La modificación condicional reserva un solo ejemplar aunque compitan usuarios.
    const copy = await collection('ejemplares').findOneAndUpdate(
      { libro_id: bookId, estatus: 'DISPONIBLE' },
      { $set: { estatus: 'RESERVADO' } },
      {
        sort: { id: 1 },
        returnDocument: 'after',
        session
      },
    );
    if (!copy) fail(409, 'No hay ejemplares disponibles para reservar');

    const id = await nextId('reservaciones', session);
    const now = new Date();
    const expires = inHours(now, 24);
    await collection('reservaciones').insertOne({
      id,
      afiliado_id: req.user.id,
      libro_id: bookId,
      ejemplar_id: copy.id,
      estatus: 'ACTIVA',
      creada_en: now,
      vence_en: expires,
      terminada_en: null,
    }, { session });
    await audit(session, req.user.id, 'RESERVAR', 'reservaciones', id, {
      libro_id: bookId, ejemplar_id: copy.id,
    });
    return {
      id,
      titulo: book.titulo,
      vence_en: expires
    };
  });

  const account = await collection('cuentas').findOne({ id: req.user.id });
  if (account) void notifyReservation(account.email, saved.titulo, saved.vence_en);
  ok(res, saved, 201);
}));

router.post('/reservations/:id/cancel', requireAuth, asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  await withTx(async (session) => {
    const reservation = await collection('reservaciones').findOne({ id }, { session });
    if (!reservation) fail(404, 'Reservación no encontrada');
    if (req.user.rol === 'AFILIADO' && reservation.afiliado_id !== req.user.id) {
      fail(403, 'No puedes cancelar una reservación ajena');
    }
    if (reservation.estatus !== 'ACTIVA' || reservation.vence_en <= new Date()) {
      fail(409, 'Esta reservación ya no está activa');
    }
    await collection('reservaciones').updateOne(
      { id, estatus: 'ACTIVA' },
      { $set: { estatus: 'CANCELADA', terminada_en: new Date() } },
      { session },
    );
    await collection('ejemplares').updateOne(
      { id: reservation.ejemplar_id, estatus: 'RESERVADO' },
      { $set: { estatus: 'DISPONIBLE' } },
      { session },
    );
    await audit(session, req.user.id, 'CANCELAR', 'reservaciones', id);
  });
  ok(res, { mensaje: 'Reservación cancelada' });
}));

router.get('/loans', requireAuth, asyncRoute(async (req, res) => {
  await refreshStatuses();
  const filter = req.user.rol === 'AFILIADO'
    ? { afiliado_id: req.user.id }
    : {};
  const loans = await collection('prestamos').find(filter)
    .sort({ inicio_en: -1 }).limit(400).toArray();
  const items = (await Promise.all(loans.map(
    (item) => details(item, 'loan'),
  ))).filter(Boolean);
  ok(res, items);
}));

async function createLoan(session, staffId, affiliateId, copyId, reservationId) {
  await eligible(session, affiliateId);

  // Esta escritura serializa los préstamos concurrentes del mismo afiliado.
  await collection('afiliados').updateOne(
    { cuenta_id: affiliateId, estatus: 'ACTIVO' },
    { $inc: { revision_prestamos: 1 } },
    { session },
  );
  const count = await collection('prestamos').countDocuments({
    afiliado_id: affiliateId, devuelto_en: null,
  }, { session });
  if (count >= 5) fail(409, 'Un afiliado solo puede tener 5 préstamos activos');

  const copy = await collection('ejemplares').findOne({ id: copyId }, { session });
  const book = copy && await collection('libros').findOne({
    id: copy.libro_id, activo: true,
  }, { session });
  if (!copy || !book) fail(404, 'Ejemplar no encontrado o libro inactivo');

  if (reservationId) {
    const reservation = await collection('reservaciones').findOne({
      id: reservationId,
    }, { session });
    if (!reservation || reservation.afiliado_id !== affiliateId ||
      reservation.ejemplar_id !== copyId ||
      reservation.estatus !== 'ACTIVA' || reservation.vence_en <= new Date()) {
      fail(409, 'La reservación no está vigente o no corresponde al afiliado');
    }
    if (copy.estatus !== 'RESERVADO') fail(409, 'El ejemplar no está reservado');
    await collection('reservaciones').updateOne(
      { id: reservationId, estatus: 'ACTIVA' },
      { $set: { estatus: 'CUMPLIDA', terminada_en: new Date() } },
      { session },
    );
  } else if (copy.estatus !== 'DISPONIBLE') {
    fail(409, 'El ejemplar no está disponible para préstamo directo');
  }

  const expected = reservationId ? 'RESERVADO' : 'DISPONIBLE';
  const changed = await collection('ejemplares').updateOne(
    { id: copyId, estatus: expected },
    { $set: { estatus: 'PRESTADO' } },
    { session },
  );
  if (!changed.modifiedCount) fail(409, 'El ejemplar ya no está disponible');

  const id = await nextId('prestamos', session);
  const now = new Date();
  const loan = {
    id,
    afiliado_id: affiliateId,
    ejemplar_id: copyId,
    reservacion_id: reservationId || null,
    prestado_por: staffId,
    devuelto_por: null,
    inicio_en: now,
    vence_en: inDays(now, 7),
    devuelto_en: null,
  };
  await collection('prestamos').insertOne(loan, { session });
  await audit(session, staffId, 'PRESTAR', 'prestamos', id, {
    afiliado_id: affiliateId,
    ejemplar_id: copyId,
    reservacion_id: reservationId || null,
  });
  return plain(loan);
}

router.post('/loans', staff, asyncRoute(async (req, res) => {
  const data = parse(z.object({
    afiliado_id: positiveId,
    ejemplar_id: positiveId,
    reservacion_id: positiveId.nullable().optional(),
  }), req.body);
  await refreshStatuses();
  const loan = await withTx((session) => createLoan(
    session, req.user.id, data.afiliado_id,
    data.ejemplar_id, data.reservacion_id || null,
  ));
  ok(res, loan, 201);
}));

router.post('/reservations/:id/fulfill', staff, asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  await refreshStatuses();
  const loan = await withTx(async (session) => {
    const reservation = await collection('reservaciones').findOne({ id }, { session });
    if (!reservation) fail(404, 'Reservación no encontrada');
    return createLoan(session, req.user.id, reservation.afiliado_id, reservation.ejemplar_id, id);
  });
  ok(res, loan, 201);
}));

router.post('/loans/:id/return', staff, asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  const result = await withTx(async (session) => {
    const loan = await collection('prestamos').findOne({ id }, { session });
    if (!loan) fail(404, 'Préstamo no encontrado');
    if (loan.devuelto_en) fail(409, 'Este ejemplar ya fue devuelto');
    const late = loan.vence_en < new Date();
    await collection('prestamos').updateOne({ id, devuelto_en: null }, {
      $set: { devuelto_en: new Date(), devuelto_por: req.user.id },
    }, { session });
    await collection('ejemplares').updateOne(
      { id: loan.ejemplar_id, estatus: 'PRESTADO' },
      { $set: { estatus: 'DISPONIBLE' } }, { session },
    );
    if (late) {
      await collection('afiliados').updateOne(
        { cuenta_id: loan.afiliado_id, estatus: 'ACTIVO' },
        { $set: { estatus: 'PENALIZADO' } }, { session },
      );
    }
    await audit(session, req.user.id, 'DEVOLVER', 'prestamos', id, {
      con_retraso: late,
    });
    return {
      mensaje: late
        ? 'Devolución tardía. El afiliado quedó penalizado.'
        : 'Devolución registrada.',
      tardia: late,
    };
  });
  ok(res, result);
}));

router.get('/stats', requireAuth, asyncRoute(async (req, res) => {
  await refreshStatuses();
  const now = new Date();

  if (req.user.rol === 'AFILIADO') {
    const id = req.user.id;
    const [loans, reservations, late] = await Promise.all([
      collection('prestamos').countDocuments({ afiliado_id: id, devuelto_en: null }),
      collection('reservaciones').countDocuments({ afiliado_id: id, estatus: 'ACTIVA' }),
      collection('prestamos').countDocuments({
        afiliado_id: id,
        devuelto_en: null,
        vence_en: { $lt: now },
      }),
    ]);
    return ok(res, {
      prestamos: loans,
      reservaciones: reservations,
      vencidos: late
    });
  }

  const [books, copies, affiliates, reservations, loans, late, loanRecords] = await Promise.all([
    collection('libros').countDocuments({ activo: true }),
    collection('ejemplares').countDocuments({ estatus: 'DISPONIBLE' }),
    collection('afiliados').countDocuments({ estatus: 'ACTIVO' }),
    collection('reservaciones').countDocuments({ estatus: 'ACTIVA' }),
    collection('prestamos').countDocuments({ devuelto_en: null }),
    collection('prestamos').countDocuments({
      devuelto_en: null, vence_en: { $lt: now },
    }),
    collection('prestamos').find().project({ ejemplar_id: 1, inicio_en: 1 }).toArray(),
  ]);

  const genres = new Map();
  const monthly = new Map();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  for (const loan of loanRecords) {
    if (loan.inicio_en >= sixMonthsAgo) {
      const month = loan.inicio_en.toISOString().slice(0, 7);
      monthly.set(month, (monthly.get(month) || 0) + 1);
    }
    const copy = await collection('ejemplares').findOne({ id: loan.ejemplar_id });
    const book = copy && await collection('libros').findOne({ id: copy.libro_id });
    const genre = book && await collection('generos').findOne({ id: book.genero_id });
    if (genre) genres.set(genre.nombre, (genres.get(genre.nombre) || 0) + 1);
  }

  ok(res, {
    libros: books,
    ejemplares: copies,
    afiliados: affiliates,
    reservaciones: reservations,
    prestamos: loans,
    vencidos: late,
    generos: [...genres].map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total).slice(0, 6),
    tendencia: [...monthly].sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => ({ mes, total })),
  });
}));

export default router;
