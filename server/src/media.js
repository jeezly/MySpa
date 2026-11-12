import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { collection } from './db.js';
import {
  ApiError, asyncRoute, audit, fail, ok, requireId, withTx,
} from './core.js';
import { requireAuth } from './auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      return callback(new ApiError(422, 'Solo imágenes PNG, JPG o WebP'));
    }
    callback(null, true);
  },
});

function imageFormat(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

router.post('/', requireAuth, upload.single('imagen'), asyncRoute(async (req, res) => {
  if (!req.file) fail(422, 'Selecciona una fotografía válida');
  const mime = imageFormat(req.file.buffer);
  if (!mime) fail(422, 'El contenido no es una imagen admitida');
  const tipo = String(req.body.tipo || '').toUpperCase();
  const entityId = requireId(req.body.entidad_id);
  if (!['AUTOR', 'LIBRO', 'PERFIL'].includes(tipo)) fail(422, 'Tipo de fotografía inválido');
  if (tipo !== 'PERFIL' && req.user.rol !== 'ADMIN') {
    fail(403, 'Solo el administrador puede subir imágenes al catálogo');
  }
  if (tipo === 'PERFIL' && req.user.rol !== 'ADMIN' && req.user.id !== entityId) {
    fail(403, 'Solo puedes cambiar tu fotografía');
  }

  const fileId = crypto.randomUUID();
  const url = `/api/media/${fileId}`;
  await withTx(async (session) => {
    let target;
    if (tipo === 'AUTOR') {
      target = await collection('autores').findOne({ id: entityId, activo: true }, { session });
    } else if (tipo === 'LIBRO') {
      target = await collection('libros').findOne({ id: entityId, activo: true }, { session });
    } else {
      target = await collection('cuentas').findOne({ id: entityId, eliminada_en: null }, { session });
    }
    if (!target) fail(404, 'Registro de destino no encontrado');

    if (tipo === 'LIBRO') {
      await collection('libros').updateOne(
        { id: entityId }, { $set: { portada: url } }, { session },
      );
    } else {
      await collection('personas').updateOne(
        { id: target.persona_id }, { $set: { fotografia: url } }, { session },
      );
    }

    await collection('archivos').insertOne({
      id: fileId,
      tipo,
      entidad_id: entityId,
      mime,
      datos: req.file.buffer,
      subido_por: req.user.id,
      creado_en: new Date(),
    }, { session });
    await audit(session, req.user.id, 'SUBIR_FOTO', 'archivos', null, {
      tipo, entidad_id: entityId,
    });
  });
  ok(res, { url }, 201);
}));

router.get('/:id', asyncRoute(async (req, res) => {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) fail(404, 'Imagen no encontrada');
  const item = await collection('archivos').findOne({ id: req.params.id });
  if (!item) fail(404, 'Imagen no encontrada');
  if (item.tipo === 'PERFIL' && !req.user) fail(401, 'Inicia sesión para ver esta fotografía');
  if (item.tipo === 'PERFIL' && req.user.rol === 'AFILIADO' &&
    req.user.id !== item.entidad_id) fail(403, 'Imagen privada');
  res.set('Content-Type', item.mime);
  res.set('Cache-Control', item.tipo === 'PERFIL' ? 'private, max-age=60' : 'public, max-age=86400');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(item.datos.buffer || item.datos));
}));

export default router;
