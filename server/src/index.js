import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pool,config,ApiError,asyncRoute,refreshStatuses,ok} from './core.js';
import authRoutes,{authentication,csrfGuard} from './auth.js';
import catalogRoutes from './catalog.js';
import peopleRoutes from './people.js';
import circulationRoutes from './circulation.js';
import mediaRoutes from './media.js';

const app=express();app.disable('x-powered-by');
app.set('trust proxy',false);
app.use(helmet({crossOriginResourcePolicy:{policy:'same-origin'},contentSecurityPolicy:{directives:{'default-src':["'self'"],'img-src':["'self'",'data:','https:'],'connect-src':["'self'",'ws:','wss:'],'script-src':["'self'"],'style-src':["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],'font-src':["'self'",'data:','https://fonts.gstatic.com']}}}));
app.use(express.json({limit:'200kb'}));
app.use(cookieParser());
// Bloquea peticiones mutantes desde orígenes desconocidos, incluso en login/registro.
app.use('/api',(req,res,next)=>{
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  const origin=req.get('origin');
  const allowed=new Set([config.webOrigin,'http://localhost:5173','http://127.0.0.1:5173',`http://${req.get('host')}`,`https://${req.get('host')}`]);
  if(origin&&!allowed.has(origin))return next(new ApiError(403,'Origen no permitido'));
 }
 next();
});
app.use('/api',authentication,csrfGuard);
app.get('/api/health',asyncRoute(async(req,res)=>{await pool.query('SELECT 1');ok(res,{servicio:'MySpa API',database:'conectada'});}));
app.use('/api/auth',authRoutes);
app.use('/api/catalog',catalogRoutes);
app.use('/api/people',peopleRoutes);
app.use('/api/circulation',circulationRoutes);
app.use('/api/media',mediaRoutes);
app.use('/api',(req,res,next)=>next(new ApiError(404,'Ruta no encontrada')));
const clientDir=resolve(import.meta.dirname,'../../client/dist');
if(config.production&&existsSync(clientDir)){
 app.use(express.static(clientDir,{index:false,maxAge:'7d'}));
 app.get('*',(req,res)=>res.sendFile(resolve(clientDir,'index.html')));
}
app.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 let status=error.status||500;let message=error.message||'Error inesperado';
 if(error.code==='ER_DUP_ENTRY'){status=409;message='El correo, ISBN, nombre o código ya está registrado';}
 if(error.code==='ER_NO_REFERENCED_ROW_2'){status=422;message='El autor, editorial, género u otro registro relacionado no existe';}
 if(error.code==='ER_ROW_IS_REFERENCED_2'){status=409;message='No se puede borrar: el registro tiene información asociada';}
 if(error.name==='MulterError'){status=422;message=error.code==='LIMIT_FILE_SIZE'?'La imagen debe pesar menos de 2 MB':'Archivo no válido';}
 if(error.code==='ECONNREFUSED'||error.code==='ER_BAD_DB_ERROR'||error.code==='ER_ACCESS_DENIED_ERROR'){status=503;message='No se puede conectar a MySQL. Ejecuta npm run setup y verifica que MySQL esté activo.';}
 if(status>=500){console.error('[API]',error);message='Error interno del servidor. Revisa la consola de la API.';}
 res.status(status).json({ok:false,error:message});
});

async function main(){
 if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32){
  console.warn('[CONFIG] Ejecuta npm run setup; SESSION_SECRET se generará automáticamente.');
 }
 try {await pool.query('SELECT 1');await refreshStatuses();}
 catch(e){console.error('[MYSQL]',e.message,'\nEjecuta npm run setup o importa database/01_schema.sql desde Workbench.');process.exit(1);}
 const server=app.listen(config.port,()=>console.log(`MySpa API lista en http://localhost:${config.port}`));
 const worker=setInterval(()=>refreshStatuses().catch(e=>console.error('[VIGILANCIA]',e)),60_000);worker.unref();
 const shutdown=async()=>{clearInterval(worker);server.close();await pool.end();process.exit(0);};
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
main();
