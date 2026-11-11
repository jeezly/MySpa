import {Router} from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {pool,withTx,asyncRoute,queryOne,fail,ok,requireId,audit,ApiError} from './core.js';
import {requireAuth} from './auth.js';
const router=Router(),directory=resolve(import.meta.dirname,'../uploads');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1},fileFilter:(req,file,cb)=>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.mimetype))return cb(new ApiError(422,'Solo se permiten imágenes PNG, JPG o WebP'));cb(null,true);
}});
const fileFormat=(buf)=>{
 if(buf.length>8&&buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return {ext:'png',mime:'image/png'};
 if(buf.length>4&&buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff)return {ext:'jpg',mime:'image/jpeg'};
 if(buf.length>12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return {ext:'webp',mime:'image/webp'};
 return null;
};
router.post('/',requireAuth,(req,res,next)=>upload.single('imagen')(req,res,e=>e?next(e):next()),asyncRoute(async(req,res)=>{
 if(!req.file)fail(422,'Selecciona una fotografía válida');
 const format=fileFormat(req.file.buffer);if(!format)fail(422,'El contenido del archivo no es una imagen admitida');
 const tipo=String(req.body.tipo||'').toUpperCase(),entityId=requireId(req.body.entidad_id);
 if(!['AUTOR','LIBRO','PERFIL'].includes(tipo))fail(422,'Tipo de fotografía inválido');
 if(tipo!=='PERFIL'&&req.user.rol!=='ADMIN')fail(403,'Solo el administrador puede subir imágenes al catálogo');
 if(tipo==='PERFIL'&&req.user.rol!=='ADMIN'&&req.user.id!==entityId)fail(403,'Solo puedes cambiar tu fotografía');
 const fileId=crypto.randomUUID(),filename=`${fileId}.${format.ext}`;
 await mkdir(directory,{recursive:true});await writeFile(join(directory,filename),req.file.buffer,{flag:'wx',mode:0o600});
 await withTx(async db=>{
  let target;
  if(tipo==='AUTOR')target=await queryOne(db,'SELECT persona_id AS id FROM autores WHERE id=? AND activo=1',[entityId]);
  if(tipo==='LIBRO')target=await queryOne(db,'SELECT id FROM libros WHERE id=? AND activo=1',[entityId]);
  if(tipo==='PERFIL')target=await queryOne(db,'SELECT persona_id AS id FROM cuentas WHERE id=? AND eliminada_en IS NULL',[entityId]);
  if(!target)fail(404,'Registro de destino no encontrado');
  const url=`/api/media/${fileId}`;
  if(tipo==='LIBRO')await db.execute('UPDATE libros SET portada=? WHERE id=?',[url,target.id]);
  else await db.execute('UPDATE personas SET fotografia=? WHERE id=?',[url,target.id]);
  await db.execute('INSERT INTO archivos (id,tipo,entidad_id,nombre_archivo,mime,subido_por) VALUES (?,?,?,?,?,?)',[fileId,tipo,entityId,filename,format.mime,req.user.id]);
  await audit(db,req.user.id,'SUBIR_FOTO','archivos',null,{tipo,entidad_id:entityId});
 });ok(res,{url:`/api/media/${fileId}`},201);
}));
router.get('/:id',asyncRoute(async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))fail(404,'Imagen no encontrada');
 const item=await queryOne(pool,'SELECT * FROM archivos WHERE id=?',[req.params.id]);if(!item)fail(404,'Imagen no encontrada');
 if(item.tipo==='PERFIL'&&!req.user)fail(401,'Inicia sesión para ver esta fotografía');
 if(item.tipo==='PERFIL'&&req.user.rol==='AFILIADO'&&req.user.id!==item.entidad_id)fail(403,'Imagen privada');
 res.setHeader('Content-Type',item.mime);
 res.setHeader('Cache-Control',item.tipo==='PERFIL'?'private, max-age=60':'public, max-age=86400');
 res.setHeader('X-Content-Type-Options','nosniff');
 const bytes=await readFile(join(directory,basename(item.nombre_archivo)));res.send(bytes);
}));
export default router;
