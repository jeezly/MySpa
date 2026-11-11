import {Router} from 'express';
import {z} from 'zod';
import {pool,withTx,asyncRoute,queryOne,queryRows,fail,ok,parse,requireId,eligible,audit,refreshStatuses} from './core.js';
import {requireAuth,role} from './auth.js';
import nodemailer from 'nodemailer';
const router=Router();
const staff=(...x)=>role('ADMIN','BIBLIOTECARIO');
const loanDetails=`SELECT pr.id,pr.afiliado_id,pr.ejemplar_id,pr.reservacion_id,pr.prestado_por,pr.devuelto_por,
 pr.inicio_en,pr.vence_en,pr.devuelto_en,l.titulo,e.codigo,
 CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno) AS afiliado,
 CASE WHEN pr.devuelto_en IS NOT NULL THEN 'DEVUELTO' WHEN pr.vence_en<NOW() THEN 'VENCIDO' ELSE 'ACTIVO' END AS estatus
 FROM prestamos pr JOIN ejemplares e ON e.id=pr.ejemplar_id JOIN libros l ON l.id=e.libro_id
 JOIN cuentas c ON c.id=pr.afiliado_id JOIN personas p ON p.id=c.persona_id`;
const resDetails=`SELECT r.id,r.afiliado_id,r.ejemplar_id,r.estatus,r.creada_en,r.vence_en,r.terminada_en,l.titulo,e.codigo,
 CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno) AS afiliado
 FROM reservaciones r JOIN ejemplares e ON e.id=r.ejemplar_id JOIN libros l ON l.id=e.libro_id
 JOIN cuentas c ON c.id=r.afiliado_id JOIN personas p ON p.id=c.persona_id`;

async function notifyReservation(email,title,until){
 if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS)return;
 try{
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT)===465,
   auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
  await transport.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:email,
   subject:'MySpa | Reservación confirmada',text:`Tu reservación de "${title}" está confirmada. Vence: ${new Date(until).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}. Preséntate en la biblioteca antes de esa fecha.`});
 }catch(e){console.error('[EMAIL] No se pudo enviar confirmación:',e.message);}
}
router.get('/reservations',requireAuth,asyncRoute(async(req,res)=>{
 await refreshStatuses();
 const staffUser=req.user.rol!=='AFILIADO';
 const rows=await queryRows(pool,`${resDetails} ${staffUser?'':'WHERE r.afiliado_id=?'} ORDER BY r.creada_en DESC LIMIT 250`,staffUser?[]:[req.user.id]);ok(res,rows);
}));
router.post('/reservations',role('AFILIADO'),asyncRoute(async(req,res)=>{
 const {libro_id}=parse(z.object({libro_id:z.coerce.number().int().positive()}),req.body);
 await refreshStatuses();
 const data=await withTx(async db=>{
  await eligible(db,req.user.id);
  const title=await queryOne(db,'SELECT id,titulo FROM libros WHERE id=? AND activo=1',[libro_id]);if(!title)fail(404,'Libro no encontrado');
  const existing=await queryOne(db,`SELECT r.id FROM reservaciones r JOIN ejemplares e ON e.id=r.ejemplar_id
   WHERE r.afiliado_id=? AND e.libro_id=? AND r.estatus='ACTIVA' AND r.vence_en>NOW() LIMIT 1`,[req.user.id,libro_id]);
  if(existing)fail(409,'Ya tienes una reservación activa para este título');
  const copy=await queryOne(db,"SELECT id FROM ejemplares WHERE libro_id=? AND estatus='DISPONIBLE' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED",[libro_id]);
  if(!copy)fail(409,'No hay ejemplares disponibles para reservar');
  await db.execute("UPDATE ejemplares SET estatus='RESERVADO' WHERE id=?",[copy.id]);
  const [r]=await db.execute("INSERT INTO reservaciones (afiliado_id,ejemplar_id,vence_en) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 24 HOUR))",[req.user.id,copy.id]);
  const saved=await queryOne(db,'SELECT vence_en FROM reservaciones WHERE id=?',[r.insertId]);
  await audit(db,req.user.id,'RESERVAR','reservaciones',r.insertId,{libro_id,ejemplar_id:copy.id});
  return {id:r.insertId,titulo:title.titulo,vence_en:saved.vence_en};
 });
 const email=await queryOne(pool,'SELECT email FROM cuentas WHERE id=?',[req.user.id]);
 // Correo opcional: no bloquear la reservación si SMTP falla.
 void notifyReservation(email.email,data.titulo,data.vence_en);
 ok(res,data,201);
}));
router.post('/reservations/:id/cancel',requireAuth,asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 await withTx(async db=>{
  const r=await queryOne(db,'SELECT * FROM reservaciones WHERE id=? FOR UPDATE',[id]);if(!r)fail(404,'Reservación no encontrada');
  if(req.user.rol==='AFILIADO'&&r.afiliado_id!==req.user.id)fail(403,'No puedes cancelar una reservación ajena');
  if(r.estatus!=='ACTIVA'||new Date(r.vence_en)<=new Date())fail(409,'Esta reservación ya no está activa');
  await db.execute("UPDATE reservaciones SET estatus='CANCELADA',terminada_en=NOW() WHERE id=?",[id]);
  await db.execute("UPDATE ejemplares SET estatus='DISPONIBLE' WHERE id=? AND estatus='RESERVADO'",[r.ejemplar_id]);
  await audit(db,req.user.id,'CANCELAR','reservaciones',id);
 });ok(res,{mensaje:'Reservación cancelada'});
}));
router.get('/loans',requireAuth,asyncRoute(async(req,res)=>{
 await refreshStatuses();
 const staffUser=req.user.rol!=='AFILIADO';
 const rows=await queryRows(pool,`${loanDetails} ${staffUser?'':'WHERE pr.afiliado_id=?'} ORDER BY pr.inicio_en DESC LIMIT 400`,staffUser?[]:[req.user.id]);ok(res,rows);
}));
async function createLoan(db,operator,affiliateId,copyId,reservationId){
 await eligible(db,affiliateId);
 const {total}=await queryOne(db,'SELECT COUNT(*) AS total FROM prestamos WHERE afiliado_id=? AND devuelto_en IS NULL',[affiliateId]);
 if(total>=5)fail(409,'Un afiliado solo puede tener 5 préstamos activos');
 const cp=await queryOne(db,'SELECT e.*,l.activo FROM ejemplares e JOIN libros l ON l.id=e.libro_id WHERE e.id=? FOR UPDATE',[copyId]);
 if(!cp||!cp.activo)fail(404,'Ejemplar no encontrado o libro inactivo');
 if(reservationId){
  const resv=await queryOne(db,'SELECT * FROM reservaciones WHERE id=? FOR UPDATE',[reservationId]);
  if(!resv||resv.afiliado_id!==affiliateId||resv.ejemplar_id!==copyId||resv.estatus!=='ACTIVA'||new Date(resv.vence_en)<=new Date())fail(409,'La reservación no está vigente o no corresponde al afiliado y ejemplar');
  if(cp.estatus!=='RESERVADO')fail(409,'El ejemplar no está reservado');
  await db.execute("UPDATE reservaciones SET estatus='CUMPLIDA',terminada_en=NOW() WHERE id=?",[reservationId]);
 }else if(cp.estatus!=='DISPONIBLE')fail(409,'El ejemplar no está disponible para préstamo directo');
 const [created]=await db.execute('INSERT INTO prestamos (afiliado_id,ejemplar_id,reservacion_id,prestado_por,vence_en) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))',
  [affiliateId,copyId,reservationId||null,operator]);
 await db.execute("UPDATE ejemplares SET estatus='PRESTADO' WHERE id=?",[copyId]);
 await audit(db,operator,'PRESTAR','prestamos',created.insertId,{afiliado_id:affiliateId,ejemplar_id:copyId,reservacion_id:reservationId||null});
 const record=await queryOne(db,'SELECT * FROM prestamos WHERE id=?',[created.insertId]);return record;
}
router.post('/loans',staff(),asyncRoute(async(req,res)=>{
 const data=parse(z.object({afiliado_id:z.coerce.number().int().positive(),ejemplar_id:z.coerce.number().int().positive(),reservacion_id:z.coerce.number().int().positive().nullable().optional()}),req.body);
 await refreshStatuses();
 const loan=await withTx(db=>createLoan(db,req.user.id,data.afiliado_id,data.ejemplar_id,data.reservacion_id||null));ok(res,loan,201);
}));
router.post('/reservations/:id/fulfill',staff(),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);await refreshStatuses();
 const loan=await withTx(async db=>{
  const reservation=await queryOne(db,'SELECT * FROM reservaciones WHERE id=?',[id]);if(!reservation)fail(404,'Reservación no encontrada');
  return createLoan(db,req.user.id,reservation.afiliado_id,reservation.ejemplar_id,id);
 });ok(res,loan,201);
}));
router.post('/loans/:id/return',staff(),asyncRoute(async(req,res)=>{
 const id=requireId(req.params.id);
 const response=await withTx(async db=>{
  const loan=await queryOne(db,'SELECT * FROM prestamos WHERE id=? FOR UPDATE',[id]);if(!loan)fail(404,'Préstamo no encontrado');
  if(loan.devuelto_en)fail(409,'Este ejemplar ya fue devuelto');
  const late=new Date(loan.vence_en)<new Date();
  await db.execute('UPDATE prestamos SET devuelto_en=NOW(),devuelto_por=? WHERE id=?',[req.user.id,id]);
  await db.execute("UPDATE ejemplares SET estatus='DISPONIBLE' WHERE id=? AND estatus='PRESTADO'",[loan.ejemplar_id]);
  if(late)await db.execute("UPDATE afiliados SET estatus='PENALIZADO' WHERE cuenta_id=? AND estatus='ACTIVO'",[loan.afiliado_id]);
  await audit(db,req.user.id,'DEVOLVER','prestamos',id,{con_retraso:late});
  return {mensaje:late?'Devolución tardía. El afiliado quedó penalizado.':'Devolución registrada.',tardia:late};
 });ok(res,response);
}));
router.get('/stats',requireAuth,asyncRoute(async(req,res)=>{
 await refreshStatuses();
 if(req.user.rol==='AFILIADO'){
  const [loans,reservations,late]=await Promise.all([
   queryOne(pool,'SELECT COUNT(*) AS n FROM prestamos WHERE afiliado_id=? AND devuelto_en IS NULL',[req.user.id]),
   queryOne(pool,"SELECT COUNT(*) AS n FROM reservaciones WHERE afiliado_id=? AND estatus='ACTIVA'",[req.user.id]),
   queryOne(pool,'SELECT COUNT(*) AS n FROM prestamos WHERE afiliado_id=? AND devuelto_en IS NULL AND vence_en<NOW()',[req.user.id])
  ]);return ok(res,{prestamos:loans.n,reservaciones:reservations.n,vencidos:late.n});
 }
 const [b,cp,a,rs,lo,late,genres,monthly]=await Promise.all([
  queryOne(pool,'SELECT COUNT(*) AS n FROM libros WHERE activo=1'),
  queryOne(pool,"SELECT COUNT(*) AS n FROM ejemplares WHERE estatus='DISPONIBLE'"),
  queryOne(pool,"SELECT COUNT(*) AS n FROM afiliados WHERE estatus='ACTIVO'"),
  queryOne(pool,"SELECT COUNT(*) AS n FROM reservaciones WHERE estatus='ACTIVA'"),
  queryOne(pool,'SELECT COUNT(*) AS n FROM prestamos WHERE devuelto_en IS NULL'),
  queryOne(pool,'SELECT COUNT(*) AS n FROM prestamos WHERE devuelto_en IS NULL AND vence_en<NOW()'),
  queryRows(pool,'SELECT g.nombre,COUNT(*) AS total FROM prestamos pr JOIN ejemplares e ON e.id=pr.ejemplar_id JOIN libros l ON l.id=e.libro_id JOIN generos g ON g.id=l.genero_id GROUP BY g.id ORDER BY total DESC LIMIT 6'),
  queryRows(pool,"SELECT DATE_FORMAT(inicio_en,'%Y-%m') AS mes,COUNT(*) AS total FROM prestamos WHERE inicio_en>=DATE_SUB(NOW(),INTERVAL 6 MONTH) GROUP BY mes ORDER BY mes")
 ]);
 ok(res,{libros:b.n,ejemplares:cp.n,afiliados:a.n,reservaciones:rs.n,prestamos:lo.n,vencidos:late.n,generos:genres,tendencia:monthly});
}));
export default router;
