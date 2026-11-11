import {Router} from 'express';
import {z} from 'zod';
import {pool,asyncRoute,withTx,queryOne,queryRows,fail,ok,parse,requireId,personSchema,passwordSchema,insertPerson,updatePerson,hashPassword,commonSelect,audit} from './core.js';
import {role} from './auth.js';
const router=Router();
const baseEmployees=`SELECT c.id AS cuenta_id,c.rol,c.habilitada,c.creada_en,${commonSelect},
 CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno) AS nombre
 FROM cuentas c JOIN personas p ON p.id=c.persona_id`;
const baseAffiliates=`SELECT c.id AS cuenta_id,c.habilitada,${commonSelect},a.estatus,a.verificacion,a.documento_tipo,a.verificado_en,
 CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno) AS nombre,
 (SELECT COUNT(*) FROM prestamos pr WHERE pr.afiliado_id=c.id AND pr.devuelto_en IS NULL) AS prestamos_activos
 FROM afiliados a JOIN cuentas c ON c.id=a.cuenta_id JOIN personas p ON p.id=c.persona_id`;

router.get('/staff',role('ADMIN'),asyncRoute(async(req,res)=>{
 ok(res,await queryRows(pool,`${baseEmployees} WHERE c.rol IN ('ADMIN','BIBLIOTECARIO') AND c.eliminada_en IS NULL ORDER BY c.id DESC`));
}));
router.post('/staff',role('ADMIN'),asyncRoute(async(req,res)=>{
 const data=parse(personSchema.extend({rol:z.enum(['ADMIN','BIBLIOTECARIO']),password:passwordSchema}),req.body);
 const {rol,password,...person}=data;
 const id=await withTx(async db=>{
  const p=await insertPerson(db,person);
  const [r]=await db.execute('INSERT INTO cuentas (persona_id,email,password_hash,rol) VALUES (?,?,?,?)',[p,person.email,await hashPassword(password),rol]);
  await audit(db,req.user.id,'CREAR','empleados',r.insertId,{rol});return r.insertId;
 });ok(res,{id},201);
}));
router.patch('/staff/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 const data=parse(personSchema.extend({rol:z.enum(['ADMIN','BIBLIOTECARIO']),password:passwordSchema.optional()}),req.body);
 const {rol,password,...person}=data;
 await withTx(async db=>{
  const old=await queryOne(db,"SELECT c.*,p.id AS persona_id FROM cuentas c JOIN personas p ON p.id=c.persona_id WHERE c.id=? AND c.rol IN ('ADMIN','BIBLIOTECARIO') AND c.eliminada_en IS NULL FOR UPDATE",[id]);
  if(!old)fail(404,'Empleado no encontrado');
  if(old.rol==='ADMIN'&&rol!=='ADMIN'){
   const admins=await queryRows(db,"SELECT id FROM cuentas WHERE rol='ADMIN' AND habilitada=1 AND eliminada_en IS NULL FOR UPDATE");if(admins.length<=1)fail(409,'Debe quedar al menos un administrador activo');
  }
  if(req.user.id===id&&rol!==old.rol)fail(409,'No puedes cambiar tu propio rol');
  await updatePerson(db,old.persona_id,person);
  await db.execute(`UPDATE cuentas SET email=?,rol=?${password?',password_hash=?':''} WHERE id=?`,password?[person.email,rol,await hashPassword(password),id]:[person.email,rol,id]);
  if(password||rol!==old.rol)await db.execute('UPDATE sesiones SET revocada_en=NOW() WHERE cuenta_id=?',[id]);
  await audit(db,req.user.id,'EDITAR','empleados',id,{rol});
 });ok(res,{mensaje:'Empleado actualizado'});
}));
router.delete('/staff/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);if(id===req.user.id)fail(409,'No puedes eliminar tu propia cuenta');
 await withTx(async db=>{
  const old=await queryOne(db,"SELECT id,rol FROM cuentas WHERE id=? AND rol IN ('ADMIN','BIBLIOTECARIO') AND eliminada_en IS NULL FOR UPDATE",[id]);if(!old)fail(404,'Empleado no encontrado');
  if(old.rol==='ADMIN'){
   const admins=await queryRows(db,"SELECT id FROM cuentas WHERE rol='ADMIN' AND habilitada=1 AND eliminada_en IS NULL FOR UPDATE");if(admins.length<=1)fail(409,'No se puede eliminar el último administrador');
  }
  await db.execute('UPDATE cuentas SET habilitada=0,eliminada_en=NOW() WHERE id=?',[id]);
  await db.execute('UPDATE sesiones SET revocada_en=NOW() WHERE cuenta_id=?',[id]);
  await audit(db,req.user.id,'BAJA_LOGICA','empleados',id);
 });ok(res,{mensaje:'Empleado eliminado lógicamente'});
}));
router.get('/affiliates',role('ADMIN','BIBLIOTECARIO'),asyncRoute(async(req,res)=>{
 const q=String(req.query.q||'').trim();if(q.length>100)fail(422,'Búsqueda demasiado larga');
 const where=q?' AND (p.primer_nombre LIKE ? OR p.apellido_paterno LIKE ? OR c.email LIKE ?)':'';
 const args=q?[`%${q}%`,`%${q}%`,`%${q}%`]:[];
 ok(res,await queryRows(pool,`${baseAffiliates} WHERE c.eliminada_en IS NULL${where} ORDER BY c.id DESC LIMIT 200`,args));
}));
router.patch('/affiliates/:id',role('ADMIN'),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 const data=parse(z.object({estatus:z.enum(['ACTIVO','PENALIZADO','BAJA']),verificacion:z.enum(['PENDIENTE','VERIFICADO','RECHAZADO']),documento_tipo:z.enum(['INE','PASAPORTE','OTRO']).nullable().optional()}),req.body);
 await withTx(async db=>{
  const old=await queryOne(db,'SELECT * FROM afiliados WHERE cuenta_id=? FOR UPDATE',[id]);if(!old)fail(404,'Afiliado no encontrado');
  const pending=await queryOne(db,'SELECT COUNT(*) AS total FROM prestamos WHERE afiliado_id=? AND devuelto_en IS NULL AND vence_en<NOW()',[id]);
  if(data.estatus==='ACTIVO'&&pending.total)fail(409,'El afiliado tiene préstamos vencidos; primero registra sus devoluciones');
  if(data.estatus==='BAJA'){
   const active=await queryOne(db,'SELECT COUNT(*) AS total FROM prestamos WHERE afiliado_id=? AND devuelto_en IS NULL',[id]);
   if(active.total)fail(409,'No se puede dar de baja a un afiliado con préstamos activos');
  }
  if(data.verificacion==='VERIFICADO'&&!data.documento_tipo&&!old.documento_tipo)fail(422,'Selecciona el documento de identidad presentado');
  await db.execute('UPDATE afiliados SET estatus=?,verificacion=?,documento_tipo=?,verificado_por=?,verificado_en=? WHERE cuenta_id=?',[
   data.estatus,data.verificacion,data.documento_tipo??null,data.verificacion==='VERIFICADO'?req.user.id:null,data.verificacion==='VERIFICADO'?new Date():null,id
  ]);
  if(data.estatus==='BAJA')await db.execute("UPDATE reservaciones r JOIN ejemplares e ON e.id=r.ejemplar_id SET r.estatus='CANCELADA',r.terminada_en=NOW(),e.estatus='DISPONIBLE' WHERE r.afiliado_id=? AND r.estatus='ACTIVA'",[id]);
  await audit(db,req.user.id,'ACTUALIZAR_ESTADO','afiliados',id,data);
 });ok(res,{mensaje:'Afiliado actualizado'});
}));
export default router;
