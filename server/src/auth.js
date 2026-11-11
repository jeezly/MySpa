import crypto from 'node:crypto';
import {z} from 'zod';
import {pool,queryOne,withTx,asyncRoute,ApiError,fail,ok,parse,personSchema,passwordSchema,insertPerson,hashPassword,checkPassword,rawToken,digest,audit,commonSelect} from './core.js';
import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';

const router=Router();
const COOKIE='myspa_session';
const loginRate=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,message:{ok:false,error:'Demasiados intentos. Intenta más tarde.'}});
const registerRate=rateLimit({windowMs:60*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false,message:{ok:false,error:'Demasiados registros desde esta conexión.'}});
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production'&&process.env.LOCAL_HTTP!=='true',sameSite:'strict',path:'/',maxAge:7*86400_000};
const serialize=record=>({id:record.id,rol:record.rol,email:record.email,nombre:record.primer_nombre,apellido:record.apellido_paterno,fotografia:record.fotografia,estatus:record.estatus||null,verificacion:record.verificacion||null});

export const authentication=asyncRoute(async(req,res,next)=>{
 const token=req.cookies?.[COOKIE];if(!token||typeof token!=='string'||token.length!==64)return next();
 const row=await queryOne(pool,`SELECT s.id AS sesion_id,s.csrf_token,c.id,c.email,c.rol,c.habilitada,c.eliminada_en,
   p.primer_nombre,p.apellido_paterno,p.fotografia,a.estatus,a.verificacion
   FROM sesiones s JOIN cuentas c ON c.id=s.cuenta_id JOIN personas p ON p.id=c.persona_id
   LEFT JOIN afiliados a ON a.cuenta_id=c.id
   WHERE s.token_hash=? AND s.revocada_en IS NULL AND s.expira_en>NOW() AND c.habilitada=1 AND c.eliminada_en IS NULL`,[digest(token)]);
 if(row){req.user=serialize(row);req.sessionId=row.sesion_id;req.csrfToken=row.csrf_token;} next();
});
export const requireAuth=(req,res,next)=>req.user?next():next(new ApiError(401,'Inicia sesión para continuar'));
export const role=(...allowed)=>(req,res,next)=>req.user&&allowed.includes(req.user.rol)?next():next(new ApiError(req.user?403:401,'No tienes permiso para realizar esta acción'));
export const csrfGuard=(req,res,next)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method)||['/auth/login','/auth/register'].includes(req.path))return next();
 if(!req.user)return next(new ApiError(401,'Inicia sesión para continuar'));
 const value=req.get('x-csrf-token');
 if(typeof value!=='string'||!req.csrfToken||value.length!==req.csrfToken.length||!crypto.timingSafeEqual(Buffer.from(value),Buffer.from(req.csrfToken)))return next(new ApiError(403,'Token CSRF inválido; actualiza la página'));
 next();
};
const loadMe=async id=>queryOne(pool,`SELECT c.id,c.email,c.rol,p.primer_nombre,p.apellido_paterno,p.fotografia,a.estatus,a.verificacion FROM cuentas c
 JOIN personas p ON p.id=c.persona_id LEFT JOIN afiliados a ON a.cuenta_id=c.id WHERE c.id=?`,[id]);
router.post('/register',registerRate,asyncRoute(async(req,res)=>{
 const data=parse(personSchema.extend({password:passwordSchema}),req.body);
 const {password,...person}=data;
 const user=await withTx(async db=>{
  const pId=await insertPerson(db,person);
  const [result]=await db.execute("INSERT INTO cuentas (persona_id,email,password_hash,rol) VALUES (?,?,?,'AFILIADO')",[pId,person.email,await hashPassword(password)]);
  await db.execute("INSERT INTO afiliados (cuenta_id,estatus,verificacion) VALUES (?,'ACTIVO','PENDIENTE')",[result.insertId]);
  await audit(db,result.insertId,'REGISTRO','afiliados',result.insertId);
  return result.insertId;
 });
 res.status(201).json({ok:true,data:{id:user,mensaje:'Registro completo. Presenta una identificación en la biblioteca para habilitar tus reservaciones.'}});
}));
router.post('/login',loginRate,asyncRoute(async(req,res)=>{
 const data=parse(z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128)}),req.body);
 const row=await queryOne(pool,'SELECT id,password_hash,habilitada,eliminada_en FROM cuentas WHERE email=?',[data.email.toLowerCase()]);
 const valid=row?await checkPassword(data.password,row.password_hash):false;
 if(!valid||!row.habilitada||row.eliminada_en)fail(401,'Correo o contraseña incorrectos');
 const token=rawToken(),csrf=rawToken();
 await pool.execute('INSERT INTO sesiones (cuenta_id,token_hash,csrf_token,expira_en) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))',[row.id,digest(token),csrf]);
 await pool.execute('UPDATE cuentas SET ultimo_acceso=NOW() WHERE id=?',[row.id]);
 res.cookie(COOKIE,token,cookieOptions);
 ok(res,{user:serialize(await loadMe(row.id)),csrfToken:csrf});
}));
router.get('/me',asyncRoute(async(req,res)=>{
 if(!req.user)return ok(res,{user:null,csrfToken:null});
 ok(res,{user:req.user,csrfToken:req.csrfToken});
}));
router.post('/logout',requireAuth,asyncRoute(async(req,res)=>{
 await pool.execute('UPDATE sesiones SET revocada_en=NOW() WHERE id=?',[req.sessionId]);
 res.clearCookie(COOKIE,{path:'/',sameSite:'strict',secure:cookieOptions.secure});ok(res,{mensaje:'Sesión cerrada'});
}));
router.get('/profile',requireAuth,asyncRoute(async(req,res)=>{
 const data=await queryOne(pool,`SELECT ${commonSelect},c.rol,a.estatus,a.verificacion FROM cuentas c
 JOIN personas p ON p.id=c.persona_id LEFT JOIN afiliados a ON a.cuenta_id=c.id WHERE c.id=?`,[req.user.id]);ok(res,data);
}));
router.patch('/profile',requireAuth,asyncRoute(async(req,res)=>{
 const data=parse(personSchema.omit({email:true}).partial().strict(),req.body);
 if(!Object.keys(data).length)fail(422,'No hay cambios');
 const fields=Object.keys(data);
 await withTx(async db=>{
  await db.execute(`UPDATE personas p JOIN cuentas c ON c.persona_id=p.id SET ${fields.map(f=>`p.${f}=?`).join(',')} WHERE c.id=?`,[...fields.map(k=>data[k]),req.user.id]);
  await audit(db,req.user.id,'PERFIL_EDITADO','cuentas',req.user.id);
 });ok(res,{mensaje:'Perfil actualizado'});
}));
router.patch('/password',requireAuth,asyncRoute(async(req,res)=>{
 const data=parse(z.object({actual:z.string().min(1),nueva:passwordSchema}),req.body);
 const account=await queryOne(pool,'SELECT password_hash FROM cuentas WHERE id=?',[req.user.id]);
 if(!await checkPassword(data.actual,account.password_hash))fail(422,'La contraseña actual no es correcta');
 await withTx(async db=>{
  await db.execute('UPDATE cuentas SET password_hash=? WHERE id=?',[await hashPassword(data.nueva),req.user.id]);
  await db.execute('UPDATE sesiones SET revocada_en=NOW() WHERE cuenta_id=? AND id<>?',[req.user.id,req.sessionId]);
  await audit(db,req.user.id,'PASSWORD_CAMBIADA','cuentas',req.user.id);
 });ok(res,{mensaje:'Contraseña actualizada'});
}));
export default router;
