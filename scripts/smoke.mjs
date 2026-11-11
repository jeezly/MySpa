// Prueba integral opcional que genera y luego cancela una reservación;
// también registra y devuelve un préstamo, dejando su historial en la BD.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=process.env.MYSPA_URL||'http://127.0.0.1:4000';
const creds=(await readFile(resolve(import.meta.dirname,'../CREDENCIALES_LOCALES.txt'),'utf8'));
const users=Object.fromEntries([...creds.matchAll(/Correo: (.+)\r?\nContraseña: (.+)/g)].map(m=>[m[1].trim(),m[2].trim()]));
let checks=0;
const ensure=(condition,desc)=>{if(!condition)throw Error(`FAIL: ${desc}`);console.log(`OK ${++checks}: ${desc}`)};
async function call(path,{method='GET',body,cookie,csrf}={}){
 const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function login(email){const r=await call('/api/auth/login',{method:'POST',body:{email,password:users[email]}});ensure(r.status===200,`Login ${email}`);return {cookie:r.cookie,csrf:r.data.data.csrfToken};}
try{
 const health=await call('/api/health');ensure(health.status===200&&health.data.data.database==='conectada','MySQL conectado');
 const books=await call('/api/catalog/books');ensure(books.status===200&&books.data.data.books.length>0,'Catálogo público');
 const authors=await call('/api/catalog/authors');ensure(authors.status===200&&authors.data.data.length>0,'Directorio de autores');
 const staff=await login('bibliotecario@myspa.local');
 const forbidden=await call('/api/people/staff',{cookie:staff.cookie});ensure(forbidden.status===403,'Bibliotecario NO administra personal');
 const affiliate=await login('afiliado@myspa.local');
 const pending=await login('pendiente@myspa.local');
 const candidate=books.data.data.books.find(b=>b.disponibles>0&&b.titulo!=='Manual de futuros posibles');
 ensure(!!candidate,'Existe título disponible para pruebas');
 const blocked=await call('/api/circulation/reservations',{method:'POST',cookie:pending.cookie,csrf:pending.csrf,body:{libro_id:candidate.id}});
 ensure(blocked.status===409,'Afiliado sin verificación no reserva');
 const reservation=await call('/api/circulation/reservations',{method:'POST',cookie:affiliate.cookie,csrf:affiliate.csrf,body:{libro_id:candidate.id}});
 ensure(reservation.status===201,'Afiliado verificado reserva ejemplar');
 const rid=reservation.data.data.id;
 const cancel=await call(`/api/circulation/reservations/${rid}/cancel`,{method:'POST',cookie:affiliate.cookie,csrf:affiliate.csrf});
 ensure(cancel.status===200,'Cancelación libera ejemplar');
 const detail=await call(`/api/catalog/books/${candidate.id}`,{cookie:staff.cookie});
 const copy=detail.data.data.copies.find(c=>c.estatus==='DISPONIBLE');ensure(!!copy,'Ejemplar disponible para préstamo');
 const me=await call('/api/auth/me',{cookie:affiliate.cookie});const affiliateId=me.data.data.user.id;
 const loan=await call('/api/circulation/loans',{method:'POST',cookie:staff.cookie,csrf:staff.csrf,body:{afiliado_id:affiliateId,ejemplar_id:copy.id}});
 ensure(loan.status===201,'Bibliotecario registra préstamo directo');
 const returned=await call(`/api/circulation/loans/${loan.data.data.id}/return`,{method:'POST',cookie:staff.cookie,csrf:staff.csrf});
 ensure(returned.status===200,'Bibliotecario registra devolución');
 const admin=await login('admin@myspa.local');
 const employees=await call('/api/people/staff',{cookie:admin.cookie});ensure(employees.status===200&&employees.data.data.length>=2,'Administrador consulta empleados');
 console.log(`\n✅ ${checks} verificaciones completadas. Historial de préstamo de prueba conservado.`);
}catch(e){console.error('❌',e.message);console.error('Verifica npm run setup, npm run dev y CREDENCIALES_LOCALES.txt');process.exitCode=1;}
