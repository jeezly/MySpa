import {Router} from 'express';
import crypto from 'node:crypto';
import {isValidISBN,normalizeISBN,isAllowedCoverUrl} from './domain.js';
import {z} from 'zod';
import {pool,asyncRoute,withTx,queryRows,queryOne,fail,ok,parse,requireId,personSchema,insertPerson,updatePerson,commonSelect,audit} from './core.js';
import {role} from './auth.js';
const router=Router();

const bookSelect=`SELECT l.id,l.titulo,l.anio_publicacion,l.edicion,l.isbn,l.genero_id,l.editorial_id,l.sinopsis,l.portada,l.activo,
 g.nombre AS genero,ed.nombre AS editorial,
 COALESCE((SELECT GROUP_CONCAT(CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno) ORDER BY a.id SEPARATOR ', ')
  FROM libro_autores la JOIN autores a ON a.id=la.autor_id JOIN personas p ON p.id=a.persona_id WHERE la.libro_id=l.id),'Sin autor') AS autores,
 (SELECT COUNT(*) FROM ejemplares e WHERE e.libro_id=l.id AND e.estatus<>'BAJA') AS total,
 (SELECT COUNT(*) FROM ejemplares e WHERE e.libro_id=l.id AND e.estatus='DISPONIBLE') AS disponibles
 FROM libros l JOIN generos g ON g.id=l.genero_id JOIN editoriales ed ON ed.id=l.editorial_id`;
const isbnSchema=z.string().transform(normalizeISBN).refine(isValidISBN,'ISBN-13 con dígito verificador inválido');
const safeCover=z.union([z.string().max(255),z.null()]).optional().transform(x=>x||null).refine(
 isAllowedCoverUrl, 'Portada no admitida: usa una subida de MySpa o una imagen de Open Library por ISBN'
);
const bookSchema=z.object({titulo:z.string().trim().min(2).max(250),anio_publicacion:z.coerce.number().int().min(1450).max(new Date().getFullYear()+1),
 edicion:z.string().trim().min(1).max(80),isbn:isbnSchema,genero_id:z.coerce.number().int().positive(),editorial_id:z.coerce.number().int().positive(),
 sinopsis:z.union([z.string().trim().max(3000),z.null()]).optional().transform(x=>x||null),
 portada:safeCover,
 autor_ids:z.array(z.coerce.number().int().positive()).min(1,'Selecciona al menos un autor').max(12)
}).strict();
const authorSchema=personSchema.extend({biografia:z.union([z.string().trim().max(3000),z.null()]).optional().transform(x=>x||null)});

router.get('/reference',asyncRoute(async(req,res)=>{
 const [generos,editoriales]=await Promise.all([queryRows(pool,'SELECT * FROM generos ORDER BY nombre'),queryRows(pool,'SELECT * FROM editoriales ORDER BY nombre')]);
 ok(res,{generos,editoriales});
}));
router.post('/reference/:type',role('ADMIN'),asyncRoute(async(req,res)=>{
 const map={generos:'generos',editoriales:'editoriales'};const table=map[req.params.type];if(!table)fail(404,'Catálogo no encontrado');
 const {nombre}=parse(z.object({nombre:z.string().trim().min(2).max(table==='generos'?90:130)}),req.body);
 const [result]=await pool.execute(`INSERT INTO ${table} (nombre) VALUES (?)`,[nombre]);ok(res,{id:result.insertId,nombre},201);
}));
router.get('/authors',asyncRoute(async(req,res)=>{
 const columns=req.user?.rol==='ADMIN'?commonSelect:"p.primer_nombre,p.apellido_paterno,CASE WHEN p.email LIKE '%@autores.myspa.invalid' THEN NULL ELSE p.email END AS email,p.telefono,p.ciudad,p.estado,p.pais,p.fotografia";
 const rows=await queryRows(pool,`SELECT a.id,a.biografia,a.activo,${columns},CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno) AS nombre,
 (SELECT COUNT(*) FROM libro_autores la WHERE la.autor_id=a.id) AS libros
 FROM autores a JOIN personas p ON p.id=a.persona_id WHERE a.activo=1 ORDER BY p.apellido_paterno,p.primer_nombre`);ok(res,rows);
}));
router.post('/authors',role('ADMIN'),asyncRoute(async(req,res)=>{
 const data=parse(authorSchema,req.body);const {biografia,...person}=data;
 const id=await withTx(async db=>{
  const personId=await insertPerson(db,person);
  const [r]=await db.execute('INSERT INTO autores (persona_id,biografia) VALUES (?,?)',[personId,biografia]);
  await audit(db,req.user.id,'CREAR','autores',r.insertId);return r.insertId;
 });ok(res,{id},201);
}));
router.patch('/authors/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id),data=parse(authorSchema,req.body);const {biografia,...person}=data;
 await withTx(async db=>{
  const author=await queryOne(db,'SELECT * FROM autores WHERE id=? AND activo=1 FOR UPDATE',[id]);if(!author)fail(404,'Autor no encontrado');
  await updatePerson(db,author.persona_id,person);
  await db.execute('UPDATE autores SET biografia=? WHERE id=?',[biografia,id]);await audit(db,req.user.id,'EDITAR','autores',id);
 });ok(res,{mensaje:'Autor actualizado'});
}));
router.delete('/authors/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 const count=await queryOne(pool,'SELECT COUNT(*) AS total FROM libro_autores WHERE autor_id=?',[id]);if(count.total)fail(409,'No se puede dar de baja a un autor asociado con libros');
 const [result]=await pool.execute('UPDATE autores SET activo=0 WHERE id=?',[id]);if(!result.affectedRows)fail(404,'Autor no encontrado');
 await audit(pool,req.user.id,'BAJA','autores',id);ok(res,{mensaje:'Autor dado de baja'});
}));
router.get('/books',asyncRoute(async(req,res)=>{
 const {q='',genero='',disponibles='',page='1'}=req.query;
 const pageNum=Math.max(1,Math.min(10000,Number.parseInt(page,10)||1)),limit=12;
 if(String(q).length>100)fail(422,'Búsqueda demasiado larga');
 let where='WHERE l.activo=1';const args=[];
 if(String(q).trim()){
  where+=` AND (l.titulo LIKE ? OR l.isbn LIKE ? OR EXISTS (SELECT 1 FROM libro_autores la JOIN autores a ON a.id=la.autor_id JOIN personas p ON p.id=a.persona_id WHERE la.libro_id=l.id AND CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno) LIKE ?))`;
  const pattern=`%${String(q).trim()}%`;args.push(pattern,pattern,pattern);
 }
 if(genero){where+=' AND l.genero_id=?';args.push(requireId(genero));}
 if(disponibles==='1')where+=" AND EXISTS (SELECT 1 FROM ejemplares e WHERE e.libro_id=l.id AND e.estatus='DISPONIBLE')";
 const [{total}]=await queryRows(pool,`SELECT COUNT(*) AS total FROM libros l ${where}`,args);
 const books=await queryRows(pool,`${bookSelect} ${where} ORDER BY l.creado_en DESC,l.id DESC LIMIT ? OFFSET ?`,[...args,limit,(pageNum-1)*limit]);
 ok(res,{books,total,page:pageNum,pages:Math.max(1,Math.ceil(total/limit))});
}));
router.get('/books/:id',asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 const book=await queryOne(pool,`${bookSelect} WHERE l.id=? AND l.activo=1`,[id]);if(!book)fail(404,'Libro no encontrado');
 const [authors,copies]=await Promise.all([
  queryRows(pool,'SELECT a.id,CONCAT_WS(\' \',p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno) AS nombre FROM autores a JOIN personas p ON p.id=a.persona_id JOIN libro_autores la ON la.autor_id=a.id WHERE la.libro_id=?',[id]),
  req.user&&req.user.rol!=='AFILIADO'?queryRows(pool,'SELECT id,codigo,estatus FROM ejemplares WHERE libro_id=? ORDER BY id',[id]):Promise.resolve([])
 ]);ok(res,{...book,autor_ids:authors.map(a=>a.id),authors,copies});
}));
router.post('/books',role('ADMIN'),asyncRoute(async(req,res)=>{
 const b=parse(bookSchema,req.body);
 const id=await withTx(async db=>{
  const [result]=await db.execute('INSERT INTO libros (titulo,anio_publicacion,edicion,isbn,genero_id,editorial_id,sinopsis,portada) VALUES (?,?,?,?,?,?,?,?)',
   [b.titulo,b.anio_publicacion,b.edicion,b.isbn,b.genero_id,b.editorial_id,b.sinopsis,b.portada]);
  for(const authorId of new Set(b.autor_ids))await db.execute('INSERT INTO libro_autores VALUES (?,?)',[result.insertId,authorId]);
  await audit(db,req.user.id,'CREAR','libros',result.insertId);return result.insertId;
 });ok(res,{id},201);
}));
router.patch('/books/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id),b=parse(bookSchema,req.body);
 await withTx(async db=>{
  const book=await queryOne(db,'SELECT id FROM libros WHERE id=? AND activo=1 FOR UPDATE',[id]);if(!book)fail(404,'Libro no encontrado');
  await db.execute('UPDATE libros SET titulo=?,anio_publicacion=?,edicion=?,isbn=?,genero_id=?,editorial_id=?,sinopsis=?,portada=? WHERE id=?',
   [b.titulo,b.anio_publicacion,b.edicion,b.isbn,b.genero_id,b.editorial_id,b.sinopsis,b.portada,id]);
  await db.execute('DELETE FROM libro_autores WHERE libro_id=?',[id]);
  for(const authorId of new Set(b.autor_ids))await db.execute('INSERT INTO libro_autores VALUES (?,?)',[id,authorId]);
  await audit(db,req.user.id,'EDITAR','libros',id);
 });ok(res,{mensaje:'Libro actualizado'});
}));
router.delete('/books/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 await withTx(async db=>{
  const book=await queryOne(db,'SELECT id FROM libros WHERE id=? AND activo=1 FOR UPDATE',[id]);if(!book)fail(404,'Libro no encontrado');
  const copies=await queryRows(db,'SELECT estatus FROM ejemplares WHERE libro_id=? FOR UPDATE',[id]);
  if(copies.some(c=>['PRESTADO','RESERVADO'].includes(c.estatus)))fail(409,'Hay ejemplares prestados o reservados; no puedes dar de baja este libro');
  await db.execute('UPDATE libros SET activo=0 WHERE id=?',[id]);
  await db.execute("UPDATE ejemplares SET estatus='BAJA' WHERE libro_id=?",[id]);await audit(db,req.user.id,'BAJA','libros',id);
 });ok(res,{mensaje:'Libro dado de baja'});
}));
router.post('/books/:id/copies',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 const {cantidad}=parse(z.object({cantidad:z.coerce.number().int().min(1).max(30).default(1)}),req.body);
 const codes=await withTx(async db=>{
  const book=await queryOne(db,'SELECT id FROM libros WHERE id=? AND activo=1 FOR UPDATE',[id]);if(!book)fail(404,'Libro no encontrado');
  const result=[];for(let i=0;i<cantidad;i++){
   const code=`MSP-${id}-${cryptoRandomCode()}`;
   await db.execute('INSERT INTO ejemplares (libro_id,codigo) VALUES (?,?)',[id,code]);result.push(code);
  }
  await audit(db,req.user.id,'CREAR_EJEMPLARES','libros',id,{cantidad});return result;
 });ok(res,{codigos:codes},201);
}));
function cryptoRandomCode(){return crypto.randomBytes(6).toString('hex').toUpperCase();}
router.patch('/copies/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 const {estatus}=parse(z.object({estatus:z.enum(['DISPONIBLE','BAJA'])}),req.body);
 await withTx(async db=>{
  const cp=await queryOne(db,'SELECT * FROM ejemplares WHERE id=? FOR UPDATE',[id]);if(!cp)fail(404,'Ejemplar no encontrado');
  if(!['DISPONIBLE','BAJA'].includes(cp.estatus))fail(409,'Un ejemplar prestado o reservado no puede cambiar manualmente de estatus');
  await db.execute('UPDATE ejemplares SET estatus=? WHERE id=?',[estatus,id]);await audit(db,req.user.id,'CAMBIAR_ESTADO','ejemplares',id,{estatus});
 });ok(res,{mensaje:'Ejemplar actualizado'});
}));
export default router;
