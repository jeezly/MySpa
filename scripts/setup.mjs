import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {seedDemo} from './seed.mjs';
const root=resolve(import.meta.dirname,'..');
const envFile=resolve(root,'.env');
async function setup(){
 let env;
 try {env=await readFile(envFile,'utf8');}
 catch {env=await readFile(resolve(root,'.env.example'),'utf8');console.log('Creando .env local usando los datos root/root indicados...');}
 if(!/^SESSION_SECRET=.{32,}$/m.test(env)){
  env=env.replace(/^SESSION_SECRET=.*$/m,`SESSION_SECRET=${crypto.randomBytes(48).toString('hex')}`);
 }
 await writeFile(envFile,env,{mode:0o600});
 dotenv.config({path:envFile,override:true});
 const database=process.env.DB_NAME||'myspa';
 if(!/^[a-zA-Z0-9_]+$/.test(database))throw Error('DB_NAME solamente puede contener letras, números y guion bajo');
 console.log(`Conectando a MySQL ${process.env.DB_HOST||'127.0.0.1'}:${process.env.DB_PORT||3306}...`);
 const conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD??'',multipleStatements:true});
 try{
  const schema=(await readFile(resolve(root,'database/01_schema.sql'),'utf8')).replace(/CREATE DATABASE IF NOT EXISTS myspa/g,`CREATE DATABASE IF NOT EXISTS \`${database}\``).replace(/USE myspa;/g,`USE \`${database}\`;`);
  await conn.query(schema);console.log('Base de datos y tablas verificadas correctamente.');
 }finally {await conn.end();}
 await seedDemo();
 console.log('\n✅ MySpa preparado. Ejecuta: npm run dev');
 console.log('Portal: http://127.0.0.1:5173');
 console.log('Credenciales de prueba: CREDENCIALES_LOCALES.txt');
}
setup().catch(err=>{console.error('\n❌ Error de configuración:',err.message);if(['ER_ACCESS_DENIED_ERROR','ECONNREFUSED'].includes(err.code))console.error('Comprueba que MySQL esté iniciado y que DB_USER/DB_PASSWORD en .env coincidan con Workbench.');process.exitCode=1;});
