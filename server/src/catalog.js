import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { collection, nextId } from './db.js';
import { isAllowedCoverUrl, isValidISBN, normalizeISBN } from './domain.js';
import {
  asyncRoute, audit, fail, fullName, insertPerson, ok, parse,
  personSchema, requireId, updatePerson, withTx,
} from './core.js';
import { role } from './auth.js';

const router = Router();
const idSchema = z.coerce.number().int().positive();
const nullableText = (max) => z.union([
  z.string().trim().max(max), z.null(),
]).optional().transform((value) => value || null);

const authorSchema = personSchema.extend({ biografia: nullableText(3000) });
const bookSchema = z.object({
  titulo: z.string().trim().min(2).max(250),
  anio_publicacion: z.coerce.number().int().min(1450).max(new Date().getFullYear() + 1),
  edicion: z.string().trim().min(1).max(80),
  isbn: z.string().transform(normalizeISBN).refine(isValidISBN, 'ISBN-13 inválido'),
  genero_id: idSchema,
  editorial_id: idSchema,
  sinopsis: nullableText(3000),
  portada: nullableText(255).refine(isAllowedCoverUrl, 'Portada no admitida'),
  autor_ids: z.array(idSchema).min(1).max(12),
}).strict();

async function authorName(id, session) {
  const options = session ? { session } : {};
  const author = await collection('autores').findOne({ id, activo: true }, options);
  if (!author) return null;
  const person = await collection('personas').findOne({ id: author.persona_id }, options);
  return person ? { id, nombre: fullName(person) } : null;
}

async function bookView(book, options = {}) {
  const { session, includeCopies = false } = options;
  const opts = session ? { session } : {};
  const [genre, publisher, copies] = await Promise.all([
    collection('generos').findOne({ id: book.genero_id }, opts),
    collection('editoriales').findOne({ id: book.editorial_id }, opts),
    collection('ejemplares').find({ libro_id: book.id }, opts).sort({ id: 1 }).toArray(),
  ]);
  const authors = (await Promise.all(
    book.autor_ids.map((id) => authorName(id, session)),
  )).filter(Boolean);

  const { _id, ...publicBook } = book;
  return {
    ...publicBook,
    genero: genre?.nombre || '',
    editorial: publisher?.nombre || '',
    autores: authors.map((item) => item.nombre).join(', ') || 'Sin autor',
    total: copies.filter((copy) => copy.estatus !== 'BAJA').length,
    disponibles: copies.filter((copy) => copy.estatus === 'DISPONIBLE').length,
    ...(includeCopies ? {
      authors,
      copies: copies.map((copy) => ({
        id: copy.id,
        codigo: copy.codigo,
        estatus: copy.estatus,
      })),
    } : {}),
  };
}

async function validateReferences(session, book) {
  const genre = await collection('generos').findOne({ id: book.genero_id }, { session });
  const publisher = await collection('editoriales').findOne({ id: book.editorial_id }, { session });
  if (!genre || !publisher) fail(422, 'Género o editorial inexistente');
  for (const id of new Set(book.autor_ids)) {
    if (!await collection('autores').findOne({ id, activo: true }, { session })) {
      fail(422, `El autor ${id} no existe o está dado de baja`);
    }
  }
}

router.get('/reference', asyncRoute(async (req, res) => {
  const [generos, editoriales] = await Promise.all([
    collection('generos').find().sort({ nombre: 1 }).project({ _id: 0 }).toArray(),
    collection('editoriales').find().sort({ nombre: 1 }).project({ _id: 0 }).toArray(),
  ]);
  ok(res, { generos, editoriales });
}));

router.post('/reference/:type', role('ADMIN'), asyncRoute(async (req, res) => {
  const type = req.params.type;
  if (!['generos', 'editoriales'].includes(type)) fail(404, 'Catálogo no encontrado');
  const { nombre } = parse(z.object({
    nombre: z.string().trim().min(2).max(type === 'generos' ? 90 : 130),
  }), req.body);
  const id = await nextId(type);
  await collection(type).insertOne({ id, nombre });
  ok(res, { id, nombre }, 201);
}));

router.get('/authors', asyncRoute(async (req, res) => {
  const authors = await collection('autores').find({ activo: true }).toArray();
  const books = await collection('libros').find({ activo: true }).toArray();
  const rows = [];

  for (const author of authors) {
    const person = await collection('personas').findOne({ id: author.persona_id });
    if (!person) continue;
    const details = req.user?.rol === 'ADMIN'
      ? (() => {
        const { _id, ...rest } = person;
        return rest;
      })()
      : {
        primer_nombre: person.primer_nombre,
        apellido_paterno: person.apellido_paterno,
        email: person.email?.endsWith('@autores.myspa.invalid') ? null : person.email,
        telefono: person.telefono,
        ciudad: person.ciudad,
        estado: person.estado,
        pais: person.pais,
        fotografia: person.fotografia,
      };

    rows.push({
      id: author.id,
      biografia: author.biografia,
      activo: author.activo,
      ...details,
      nombre: fullName(person),
      libros: books.filter((book) => book.autor_ids.includes(author.id)).length,
    });
  }
  rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  ok(res, rows);
}));

router.post('/authors', role('ADMIN'), asyncRoute(async (req, res) => {
  const { biografia, ...person } = parse(authorSchema, req.body);
  const id = await withTx(async (session) => {
    const personId = await insertPerson(session, person);
    const authorId = await nextId('autores', session);
    await collection('autores').insertOne({
      id: authorId,
      persona_id: personId,
      biografia,
      activo: true,
    }, { session });
    await audit(session, req.user.id, 'CREAR', 'autores', authorId);
    return authorId;
  });
  ok(res, { id }, 201);
}));

router.patch('/authors/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  const { biografia, ...person } = parse(authorSchema, req.body);
  await withTx(async (session) => {
    const author = await collection('autores').findOne({ id, activo: true }, { session });
    if (!author) fail(404, 'Autor no encontrado');
    await updatePerson(session, author.persona_id, person);
    await collection('autores').updateOne(
      { id }, { $set: { biografia } }, { session },
    );
    await audit(session, req.user.id, 'EDITAR', 'autores', id);
  });
  ok(res, { mensaje: 'Autor actualizado' });
}));

router.delete('/authors/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  await withTx(async (session) => {
    const author = await collection('autores').findOne({ id, activo: true }, { session });
    if (!author) fail(404, 'Autor no encontrado');
    if (await collection('libros').countDocuments({ autor_ids: id }, { session })) {
      fail(409, 'No se puede dar de baja a un autor asociado con libros');
    }
    await collection('autores').updateOne({ id }, { $set: { activo: false } }, { session });
    await audit(session, req.user.id, 'BAJA', 'autores', id);
  });
  ok(res, { mensaje: 'Autor dado de baja' });
}));

router.get('/books', asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim().toLocaleLowerCase('es-MX');
  if (query.length > 100) fail(422, 'Búsqueda demasiado larga');
  const genre = req.query.genero ? requireId(req.query.genero) : null;
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const books = await collection('libros').find({
    activo: true, ...(genre ? { genero_id: genre } : {}),
  }).sort({ creado_en: -1, id: -1 }).toArray();
  const enriched = await Promise.all(books.map((book) => bookView(book)));
  const matches = enriched.filter((book) => {
    if (req.query.disponibles === '1' && !book.disponibles) return false;
    return !query || [book.titulo, book.isbn, book.autores].some(
      (value) => value.toLocaleLowerCase('es-MX').includes(query),
    );
  });
  const size = 12;
  ok(res, {
    books: matches.slice((page - 1) * size, page * size),
    total: matches.length,
    page,
    pages: Math.max(1, Math.ceil(matches.length / size)),
  });
}));

router.get('/books/:id', asyncRoute(async (req, res) => {
  const book = await collection('libros').findOne({
    id: requireId(req.params.id), activo: true,
  });
  if (!book) fail(404, 'Libro no encontrado');
  const view = await bookView(book, {
    includeCopies: Boolean(req.user && req.user.rol !== 'AFILIADO'),
  });
  if (!view.authors) {
    view.authors = (await Promise.all(book.autor_ids.map(authorName))).filter(Boolean);
  }
  ok(res, view);
}));

router.post('/books', role('ADMIN'), asyncRoute(async (req, res) => {
  const raw = parse(bookSchema, req.body);
  const book = { ...raw, autor_ids: [...new Set(raw.autor_ids)] };
  const id = await withTx(async (session) => {
    await validateReferences(session, book);
    const bookId = await nextId('libros', session);
    await collection('libros').insertOne({
      ...book,
      id: bookId,
      activo: true,
      creado_en: new Date(),
    }, { session });
    await audit(session, req.user.id, 'CREAR', 'libros', bookId);
    return bookId;
  });
  ok(res, { id }, 201);
}));

router.patch('/books/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  const raw = parse(bookSchema, req.body);
  const book = { ...raw, autor_ids: [...new Set(raw.autor_ids)] };
  await withTx(async (session) => {
    const current = await collection('libros').findOne({ id, activo: true }, { session });
    if (!current) fail(404, 'Libro no encontrado');
    await validateReferences(session, book);
    await collection('libros').updateOne({ id }, { $set: book }, { session });
    await audit(session, req.user.id, 'EDITAR', 'libros', id);
  });
  ok(res, { mensaje: 'Libro actualizado' });
}));

router.delete('/books/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  await withTx(async (session) => {
    const book = await collection('libros').findOne({ id, activo: true }, { session });
    if (!book) fail(404, 'Libro no encontrado');
    const busy = await collection('ejemplares').countDocuments({
      libro_id: id, estatus: { $in: ['PRESTADO', 'RESERVADO'] },
    }, { session });
    if (busy) fail(409, 'Hay ejemplares prestados o reservados');
    await collection('libros').updateOne({ id }, { $set: { activo: false } }, { session });
    await collection('ejemplares').updateMany(
      { libro_id: id }, { $set: { estatus: 'BAJA' } }, { session },
    );
    await audit(session, req.user.id, 'BAJA', 'libros', id);
  });
  ok(res, { mensaje: 'Libro dado de baja' });
}));

router.post('/books/:id/copies', role('ADMIN'), asyncRoute(async (req, res) => {
  const bookId = requireId(req.params.id);
  const { cantidad } = parse(z.object({
    cantidad: z.coerce.number().int().min(1).max(30).default(1),
  }), req.body);
  const codes = await withTx(async (session) => {
    const book = await collection('libros').findOne({ id: bookId, activo: true }, { session });
    if (!book) fail(404, 'Libro no encontrado');
    const items = [];
    for (let i = 0; i < cantidad; i++) {
      const id = await nextId('ejemplares', session);
      const codigo = `MSP-${bookId}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      await collection('ejemplares').insertOne({
        id,
        libro_id: bookId,
        codigo,
        estatus: 'DISPONIBLE',
        adquirido_en: new Date(),
      }, { session });
      items.push(codigo);
    }
    await audit(session, req.user.id, 'CREAR_EJEMPLARES', 'libros', bookId, { cantidad });
    return items;
  });
  ok(res, { codigos: codes }, 201);
}));

router.patch('/copies/:id', role('ADMIN'), asyncRoute(async (req, res) => {
  const id = requireId(req.params.id);
  const { estatus } = parse(z.object({
    estatus: z.enum(['DISPONIBLE', 'BAJA']),
  }), req.body);
  await withTx(async (session) => {
    const copy = await collection('ejemplares').findOne({ id }, { session });
    if (!copy) fail(404, 'Ejemplar no encontrado');
    if (!['DISPONIBLE', 'BAJA'].includes(copy.estatus)) {
      fail(409, 'No puedes modificar un ejemplar prestado o reservado');
    }
    await collection('ejemplares').updateOne({ id }, { $set: { estatus } }, { session });
    await audit(session, req.user.id, 'CAMBIAR_ESTADO', 'ejemplares', id, { estatus });
  });
  ok(res, { mensaje: 'Ejemplar actualizado' });
}));

export default router;
