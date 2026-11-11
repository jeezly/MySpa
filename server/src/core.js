import dotenv from 'dotenv';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
dotenv.config({path:resolve(fileURLToPath(new URL('../../.env',import.meta.url)))});
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {z} from 'zod';
export {inDays,inHours,normalizeISBN,isValidISBN,newISBN} from './domain.js';

export const config = {
  port: Number(process.env.PORT || 4000),
  database: process.env.DB_NAME || 'myspa',
  production: process.env.NODE_ENV === 'production',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173'
};
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: config.database,
  waitForConnections: true, connectionLimit: 10, queueLimit: 0,
  timezone: 'Z', dateStrings: false, decimalNumbers: true
});
pool.pool.on('connection', conn => conn.query("SET time_zone = '+00:00'"));

export const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
export class ApiError extends Error { constructor(status, message) {super(message);this.status=status;} }
export const fail = (status,message) => { throw new ApiError(status,message); };
export const ok = (res,data,status=200) => res.status(status).json({ok:true,data});
export async function withTx(handler) {
 // Bloqueos InnoDB: reintentar operaciones transitorias si dos usuarios compiten por la misma fila.
 for(let attempt=0;attempt<3;attempt++){
  const conn=await pool.getConnection();
  try {await conn.beginTransaction();const value=await handler(conn);await conn.commit();return value;}
  catch(e){try{await conn.rollback();}catch{}if(!['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code)||attempt===2)throw e;}
  finally{conn.release();}
 }
}
export async function queryOne(db,sql,args=[]) {const [rows]=await db.execute(sql,args);return rows[0]??null;}
export async function queryRows(db,sql,args=[]) {const [rows]=await db.execute(sql,args);return rows;}
export function requireId(raw) {const n=Number(raw);if(!Number.isSafeInteger(n)||n<1)fail(400,'Identificador no válido');return n;}
export function parse(schema,value){const result=schema.safeParse(value);if(!result.success){const first=result.error.issues[0]; fail(422,`${first.path.join('.')||'Campo'}: ${first.message}`);}return result.data;}

const isRealBirthDate=x=>{const [y,m,d]=x.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d&&date<=new Date();};
const optionalText = (max=150)=>z.union([z.string().trim().max(max), z.null()]).optional().transform(x=>x||null);
export const personSchema=z.object({
 primer_nombre:z.string().trim().min(2).max(80),
 segundo_nombre:optionalText(80),
 apellido_paterno:z.string().trim().min(2).max(80),
 apellido_materno:optionalText(80),
 genero:z.enum(['MUJER','HOMBRE','NO_BINARIO','OTRO','PREFIERO_NO_DECIR']).default('PREFIERO_NO_DECIR'),
 fecha_nacimiento:z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealBirthDate,'Fecha de nacimiento inválida o futura'), z.null()]).optional().transform(x=>x||null),
 domicilio:optionalText(240), codigo_postal:optionalText(12), ciudad:optionalText(100), estado:optionalText(100),
 pais:z.string().trim().min(2).max(100).default('México'),
 email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),
 telefono:optionalText(25),
 fotografia:optionalText(255)
}).strict();
export const personFields=Object.keys(personSchema.shape);
export function personParams(p){return personFields.map(k=>p[k]??null);}
export function personInsertSQL(){return `INSERT INTO personas (${personFields.join(',')}) VALUES (${personFields.map(()=>'?').join(',')})`;}
export async function insertPerson(db,p) {const [r]=await db.execute(personInsertSQL(),personParams(p));return r.insertId;}
export async function updatePerson(db,id,input){
 const p=parse(personSchema,input);
 await db.execute(`UPDATE personas SET ${personFields.map(x=>`${x}=?`).join(', ')} WHERE id=?`,[...personParams(p),id]);
 return p;
}
export const passwordSchema=z.string().min(10,'Al menos 10 caracteres').max(128).regex(/[A-ZÁÉÍÓÚ]/,'Incluye una mayúscula').regex(/[a-záéíóú]/,'Incluye una minúscula').regex(/\d/,'Incluye un número');
const scrypt=promisify(crypto.scrypt);
export async function hashPassword(password){const salt=crypto.randomBytes(16);const key=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024});return `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`;}
export async function checkPassword(password,encoded){
 try {const [algo,n,r,p,salt,hash]=encoded.split('$');if(algo!=='scrypt')return false;
 const actual=Buffer.from(hash,'hex');const candidate=await scrypt(password,Buffer.from(salt,'hex'),actual.length,{N:Number(n),r:Number(r),p:Number(p),maxmem:32*1024*1024});
 return actual.length===candidate.length&&crypto.timingSafeEqual(actual,candidate);
 }catch{return false;}
}
export const rawToken=()=>crypto.randomBytes(32).toString('hex');
export const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
export function audit(db,actor,action,entity,id,detail=null){return db.execute('INSERT INTO auditoria (actor_id,accion,entidad,entidad_id,detalle) VALUES (?,?,?,?,?)',[actor||null,action,entity,id||null,detail?JSON.stringify(detail):null]);}
export const commonSelect=`p.id AS persona_id,p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno,p.genero,p.fecha_nacimiento,p.domicilio,p.codigo_postal,p.ciudad,p.estado,p.pais,p.email,p.telefono,p.fotografia,p.fecha_registro`;
export const nameSQL=`CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno,p.apellido_materno)`;
export async function refreshStatuses(db=pool){
 // El servidor reconcilia tiempos en cada operación y cada minuto; no depende de un navegador abierto.
 await db.execute("UPDATE reservaciones SET estatus='EXPIRADA',terminada_en=NOW() WHERE estatus='ACTIVA' AND vence_en<=NOW()");
 await db.execute(`UPDATE ejemplares e SET estatus='DISPONIBLE' WHERE e.estatus='RESERVADO'
   AND NOT EXISTS (SELECT 1 FROM reservaciones r WHERE r.ejemplar_id=e.id AND r.estatus='ACTIVA' AND r.vence_en>NOW())
   AND NOT EXISTS (SELECT 1 FROM prestamos pr WHERE pr.ejemplar_id=e.id AND pr.devuelto_en IS NULL)`);
 await db.execute(`UPDATE afiliados a SET a.estatus='PENALIZADO' WHERE a.estatus='ACTIVO' AND EXISTS
   (SELECT 1 FROM prestamos pr WHERE pr.afiliado_id=a.cuenta_id AND pr.devuelto_en IS NULL AND pr.vence_en<NOW())`);
}
export async function eligible(db,affiliateId,lock=true){
 const r=await queryOne(db,`SELECT a.*,c.habilitada,c.eliminada_en FROM afiliados a JOIN cuentas c ON c.id=a.cuenta_id WHERE a.cuenta_id=?${lock?' FOR UPDATE':''}`,[affiliateId]);
 if(!r)fail(404,'Afiliado no encontrado');
 if(!r.habilitada||r.eliminada_en||r.estatus!=='ACTIVO')fail(409,'El afiliado debe tener estatus Activo');
 if(r.verificacion!=='VERIFICADO')fail(409,'El afiliado debe verificar su identidad en la biblioteca');
 const late=await queryOne(db,'SELECT COUNT(*) AS total FROM prestamos WHERE afiliado_id=? AND devuelto_en IS NULL AND vence_en<NOW()',[affiliateId]);
 if(late.total)fail(409,'El afiliado tiene préstamos vencidos y fue penalizado');
 return r;
}
