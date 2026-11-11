import crypto from 'node:crypto';
import {writeFile,access,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {hashPassword,newISBN} from '../server/src/core.js';
const root=resolve(import.meta.dirname,'..');
dotenv.config({path:resolve(root,'.env'),override:true});
const personCols=['primer_nombre','segundo_nombre','apellido_paterno','apellido_materno','genero','fecha_nacimiento','domicilio','codigo_postal','ciudad','estado','pais','email','telefono','fotografia'];
async function addPerson(db,record){
 const val={segundo_nombre:null,apellido_materno:null,genero:'PREFIERO_NO_DECIR',fecha_nacimiento:null,domicilio:'Calle Ejemplo 123',codigo_postal:'37000',ciudad:'León',estado:'Guanajuato',pais:'México',telefono:null,fotografia:null,...record};
 const [r]=await db.execute(`INSERT INTO personas (${personCols.join(',')}) VALUES (${personCols.map(()=>'?').join(',')})`,personCols.map(k=>val[k]));return r.insertId;
}
const credentials={};
const demoPass=()=>`Spa-${crypto.randomBytes(12).toString('base64url')}Aa9!`;
async function addUser(db,record,rol,extra={}){
 const personId=await addPerson(db,record);const password=demoPass();
 const [r]=await db.execute('INSERT INTO cuentas (persona_id,email,password_hash,rol) VALUES (?,?,?,?)',[personId,record.email,await hashPassword(password),rol]);
 credentials[rol==='AFILIADO'?record.email:rol]={email:record.email,password};
 if(rol==='AFILIADO')await db.execute('INSERT INTO afiliados (cuenta_id,estatus,verificacion,documento_tipo,verificado_en) VALUES (?,?,?,?,?)',
  [r.insertId,extra.estatus||'ACTIVO',extra.verificacion||'VERIFICADO',extra.verificacion==='PENDIENTE'?null:'INE',extra.verificacion==='PENDIENTE'?null:new Date()]);
 return r.insertId;
}
const authorData=[
 ['Valeria','Mendoza','Narrativa de lo cotidiano, los recuerdos y las ciudades.'],
 ['Emilio','Salcedo','Historias de descubrimiento científico para lectores curiosos.'],
 ['Luna','Arriaga','Ficción especulativa y viajes por mundos imaginarios.'],
 ['Diego','Robles','Ensayo contemporáneo sobre cultura, pensamiento y arte.'],
 ['Camila','Paredes','Explora la poesía, la identidad y la naturaleza.'],
 ['Mateo','Beltrán','Autor de suspenso y relatos de misterio.'],
 ['Sofía','Carranza','Escritora de literatura juvenil y aventuras.'],
 ['Nicolás','Reyes','Divulgación tecnológica y futuros posibles.']
];
const bookData=[
 ['El jardín de las páginas',2022,1,1,[1],`Una librería escondida guarda recuerdos que nadie se atreve a contar.`],
 ['Atlas de medianoche',2024,2,2,[3],`Los mapas cambian cuando la ciudad se queda dormida.`],
 ['Manual de futuros posibles',2025,3,3,[8,2],`Ciencia, tecnología y decisiones para el mundo que viene.`],
 ['El rumor de las montañas',2020,1,4,[5],`Poemas sobre aquello que permanece cuando todo cambia.`],
 ['El último faro',2021,5,2,[6],`Un misterio junto al mar: la luz aparece una noche más.`],
 ['La ciudad de las luciérnagas',2023,1,1,[1,7],`Dos generaciones descubren un secreto entre las calles.`],
 ['Constelaciones de papel',2024,2,5,[7],`Una aventura para quienes todavía creen en lo imposible.`],
 ['Preguntas para mañana',2025,3,3,[4],`Ideas breves para pensar la cultura y el presente.`],
 ['Horizontes invisibles',2022,2,2,[3],`Un viaje hacia un lugar que no figura en ningún mapa.`],
 ['Código y conciencia',2026,3,3,[8],`Una guía accesible a los dilemas de la inteligencia artificial.`],
 ['El puente de los ecos',2019,5,1,[6,1],`Nadie recuerda quién construyó el puente en la madrugada.`],
 ['Botánica de las emociones',2021,4,4,[5],`Versos para aprender a mirar el paisaje desde adentro.`],
 ['El archivo del viento',2023,1,2,[2,7],`La respuesta a un enigma científico cabe en una vieja carta.`],
 ['La hora de los relojes',2026,5,5,[6],`El tiempo desaparece durante sesenta segundos.`],
 ['Luces sobre el agua',2024,4,1,[1],`Una novela íntima sobre empezar de nuevo.`]
];
export async function seedDemo(){
 const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD??'',database:process.env.DB_NAME||'myspa',timezone:'Z'});
 try{
  await db.query("SET time_zone = '+00:00'");
  const [[{num:users}]]=await db.query('SELECT COUNT(*) AS num FROM cuentas');
  const [[{num:books}]]=await db.query('SELECT COUNT(*) AS num FROM libros');
  await db.beginTransaction();
  try{
   let adminId,staffId,affiliateId;
   if(users===0){
    adminId=await addUser(db,{primer_nombre:'Andrea',apellido_paterno:'Directora',email:'admin@myspa.local',genero:'MUJER',fecha_nacimiento:'1989-04-12',telefono:'4770000001'},'ADMIN');
    staffId=await addUser(db,{primer_nombre:'Marco',apellido_paterno:'Bibliotecario',email:'bibliotecario@myspa.local',genero:'HOMBRE',fecha_nacimiento:'1994-08-22',telefono:'4770000002'},'BIBLIOTECARIO');
    affiliateId=await addUser(db,{primer_nombre:'Alex',apellido_paterno:'Lector',email:'afiliado@myspa.local',genero:'OTRO',fecha_nacimiento:'2001-10-05',telefono:'4770000003'},'AFILIADO');
    await addUser(db,{primer_nombre:'Daniela',apellido_paterno:'PorVerificar',email:'pendiente@myspa.local',genero:'MUJER',telefono:'4770000004'},'AFILIADO',{verificacion:'PENDIENTE'});
   }
   if(books===0){
    for(const name of ['Narrativa','Fantasía','Divulgación','Poesía','Misterio','Historia','Tecnología'])await db.execute('INSERT IGNORE INTO generos (nombre) VALUES (?)',[name]);
    for(const name of ['Editorial Horizonte','Libros del Sur','Casa del Saber','Viento Editorial','Nido de Tinta'])await db.execute('INSERT IGNORE INTO editoriales (nombre) VALUES (?)',[name]);
    const [genres]=await db.query('SELECT * FROM generos');const [publishers]=await db.query('SELECT * FROM editoriales');
    const genreMap=Object.fromEntries(genres.map(g=>[g.nombre,g.id]));const pubMap=Object.fromEntries(publishers.map(p=>[p.nombre,p.id]));
    const gs=['Narrativa','Fantasía','Divulgación','Poesía','Misterio'];const es=['Editorial Horizonte','Libros del Sur','Casa del Saber','Viento Editorial','Nido de Tinta'];
    const authorIds=[];
    for(let i=0;i<authorData.length;i++){
     const [first,last,bio]=authorData[i];const p=await addPerson(db,{primer_nombre:first,apellido_paterno:last,email:`autor${i+1}@ejemplo.test`,genero:'PREFIERO_NO_DECIR',telefono:`47700010${String(i).padStart(2,'0')}`});
     const [r]=await db.execute('INSERT INTO autores (persona_id,biografia) VALUES (?,?)',[p,bio]);authorIds.push(r.insertId);
    }
    const copies=[];
    for(let i=0;i<bookData.length;i++){
     const [title,year,genreN,pubN,authors,synopsis]=bookData[i];
     const [r]=await db.execute('INSERT INTO libros (titulo,anio_publicacion,edicion,isbn,genero_id,editorial_id,sinopsis) VALUES (?,?,?,?,?,?,?)',
      [title,year,'Primera',newISBN(i+100),genreMap[gs[genreN-1]],pubMap[es[pubN-1]],synopsis]);
     for(const k of authors)await db.execute('INSERT INTO libro_autores VALUES (?,?)',[r.insertId,authorIds[k-1]]);
     for(let j=0;j<3+(i%3);j++){
      const [c]=await db.execute('INSERT INTO ejemplares (libro_id,codigo) VALUES (?,?)',[r.insertId,`MSP-${String(i+1).padStart(3,'0')}-${String(j+1).padStart(3,'0')}`]);copies.push({id:c.insertId,book:i,number:j});
     }
    }
    if(users===0){
     const sampleCopy=copies.find(c=>c.book===0);
     await db.execute("UPDATE ejemplares SET estatus='PRESTADO' WHERE id=?",[sampleCopy.id]);
     await db.execute('INSERT INTO prestamos (afiliado_id,ejemplar_id,prestado_por,vence_en) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))',[affiliateId,sampleCopy.id,staffId]);
     const secondCopy=copies.find(c=>c.book===2);
     await db.execute("UPDATE ejemplares SET estatus='RESERVADO' WHERE id=?",[secondCopy.id]);
     await db.execute('INSERT INTO reservaciones (afiliado_id,ejemplar_id,vence_en) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 24 HOUR))',[affiliateId,secondCopy.id]);
    }
   }
   await db.commit();
  }catch(e){await db.rollback();throw e;}
  if(Object.keys(credentials).length){
   const records=[['Administrador',credentials.ADMIN],['Bibliotecario',credentials.BIBLIOTECARIO],['Afiliado verificado',credentials['afiliado@myspa.local']],['Afiliado pendiente',credentials['pendiente@myspa.local']]];
   await writeFile(resolve(root,'CREDENCIALES_LOCALES.txt'),`MySpa • CUENTAS DEMO (solo desarrollo local)\nNO SUBIR ESTE ARCHIVO A INTERNET\n\n`+
    records.map(([label,c])=>`${label}\nCorreo: ${c.email}\nContraseña: ${c.password}\n`).join('\n'),{mode:0o600});
   console.log('Se crearon 4 cuentas de prueba con contraseñas aleatorias seguras.');
  }else console.log('Se conservaron los usuarios existentes (configuración idempotente).');
  if(books===0)console.log('Se prepararon 15 libros, 8 autores, editoriales, géneros y ejemplares.');
 }finally{await db.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 seedDemo().catch(e=>{console.error(e);process.exitCode=1;});
}
