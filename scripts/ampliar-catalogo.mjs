/**
 * MySpa: catálogo complementario de obras publicadas (ediciones identificadas por ISBN).
 * Idempotente: jamás borra ni modifica los libros, cuentas, préstamos o reservas existentes.
 * Ejecución: npm run catalogo | npm run catalogo:revisar
 * La disponibilidad de las portadas depende de Open Library y de la conexión a Internet.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isValidISBN,coverForISBN} from '../server/src/domain.js';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));

// Año, editorial y edición se refieren al ejemplar editorial identificado por su ISBN,
// no a la fecha de publicación original de la obra.
export const novedades=[
 {isbn:'9780785124924',titulo:'Ultimate Spider-Man: Ultimate Collection, Vol. 1',anio:2007,edicion:'Ultimate Collection, vol. 1',genero:'Cómics',editorial:'Marvel Comics',autores:[['Brian Michael','Bendis'],['Mark','Bagley']],copias:3,sinopsis:'Peter Parker descubre sus poderes y aprende lo que significa ser Spider-Man en una reinterpretación moderna del personaje.'},
 {isbn:'9780760761335',titulo:'Ultimate Spider-Man Collection',anio:2004,edicion:'Colección integral, tapa dura',genero:'Cómics',editorial:'Barnes & Noble Books',autores:[['Brian Michael','Bendis'],['Mark','Bagley']],copias:2,sinopsis:'Antología de las primeras aventuras de Ultimate Spider-Man, reunidas en una edición de colección.'},
 {isbn:'9780446389235',titulo:'Batman: Year One',anio:1988,edicion:'Edición DC Comics',genero:'Cómics',editorial:'DC Comics',autores:[['Frank','Miller'],['David','Mazzucchelli']],copias:2,sinopsis:'Los primeros meses de Bruce Wayne como Batman y el comienzo de la carrera de Jim Gordon en Gotham.'},
 {isbn:'9781401219260',titulo:'Watchmen',anio:2008,edicion:'DC Comics, tapa dura (inglés)',genero:'Novela gráfica',editorial:'DC Comics',autores:[['Alan','Moore'],['Dave','Gibbons']],copias:2,sinopsis:'Una investigación entre vigilantes enmascarados revela tensiones políticas, éticas y personales en un mundo al borde de la catástrofe.'},
 {isbn:'9780590353427',titulo:"Harry Potter and the Sorcerer's Stone",anio:1999,edicion:'Scholastic Paperbacks (inglés)',genero:'Novela fantástica',editorial:'Scholastic Paperbacks',autores:[['J. K.','Rowling']],copias:4,sinopsis:'Harry descubre que es mago y comienza sus estudios en Hogwarts, donde encontrará amistad, misterios y una amenaza inesperada.'},
 {isbn:'9780439064873',titulo:'Harry Potter and the Chamber of Secrets',anio:1999,edicion:'Scholastic Trade Paperback (inglés)',genero:'Novela fantástica',editorial:'Scholastic',autores:[['J. K.','Rowling']],copias:3,sinopsis:'En su segundo año en Hogwarts, Harry investiga una serie de ataques relacionados con una cámara legendaria.'},
 {isbn:'9780439136358',titulo:'Harry Potter and the Prisoner of Azkaban',anio:1999,edicion:'Scholastic, tapa dura (inglés)',genero:'Novela fantástica',editorial:'Scholastic',autores:[['J. K.','Rowling']],copias:3,sinopsis:'Un prisionero fugitivo, los dementores y un secreto del pasado transforman el tercer año de Harry en Hogwarts.'},
 {isbn:'9780547928227',titulo:'The Hobbit',anio:2012,edicion:'Mariner, tapa blanda (inglés)',genero:'Novela fantástica',editorial:'Mariner Books',autores:[['J. R. R.','Tolkien']],copias:4,sinopsis:'Bilbo Bolsón abandona la Comarca y emprende una expedición con enanos hacia la Montaña Solitaria.'},
 {isbn:'9780544003415',titulo:'The Lord of the Rings',anio:2012,edicion:'50.º aniversario, tomo único (inglés)',genero:'Novela fantástica',editorial:'Houghton Mifflin',autores:[['J. R. R.','Tolkien']],copias:4,sinopsis:'Frodo y sus compañeros deben atravesar la Tierra Media para destruir el Anillo Único y enfrentar la sombra de Sauron.'},
 {isbn:'9780441172719',titulo:'Dune',anio:1990,edicion:'Ace, tapa blanda (inglés)',genero:'Ciencia ficción',editorial:'Ace Books',autores:[['Frank','Herbert']],copias:4,sinopsis:'La disputa por Arrakis y la especia sitúa a Paul Atreides en el centro de una intriga política, ecológica y religiosa.'},
 {isbn:'9780143106265',titulo:'The Communist Manifesto',anio:2011,edicion:'Penguin Classics (inglés)',genero:'Pensamiento político',editorial:'Penguin Classics',autores:[['Karl','Marx'],['Friedrich','Engels']],copias:3,sinopsis:'Marx y Engels exponen su interpretación de la lucha de clases, las transformaciones históricas y el capitalismo industrial.'},
 {isbn:'9780140445688',titulo:'Capital: Volume One',anio:1990,edicion:'Penguin Classics, volumen I (inglés)',genero:'Filosofía',editorial:'Penguin Books',autores:[['Karl','Marx']],copias:3,sinopsis:'Análisis crítico de la mercancía, el valor, el trabajo y las relaciones sociales de producción capitalistas.'},
 {isbn:'9780140449143',titulo:'The Republic',anio:2003,edicion:'Penguin Classics, 2.ª ed. (inglés)',genero:'Filosofía',editorial:'Penguin Classics',autores:[['Platón','de Atenas']],copias:3,sinopsis:'Diálogo filosófico sobre justicia, educación, conocimiento, política y la organización de la ciudad.'},
 {isbn:'9780140449235',titulo:'Beyond Good and Evil',anio:2003,edicion:'Penguin Classics (inglés)',genero:'Filosofía',editorial:'Penguin Classics',autores:[['Friedrich','Nietzsche']],copias:3,sinopsis:'Crítica de la moral tradicional, de los prejuicios filosóficos y de las formas establecidas de valorar el mundo.'},
 {isbn:'9780143039884',titulo:'Eichmann in Jerusalem',anio:2006,edicion:'Penguin Classics (inglés)',genero:'Pensamiento político',editorial:'Penguin Classics',autores:[['Hannah','Arendt']],copias:3,sinopsis:'Análisis del juicio de Adolf Eichmann y reflexión sobre responsabilidad individual, burocracia y banalidad del mal.'},
 {isbn:'9780099499381',titulo:'The Second Sex',anio:2010,edicion:'Vintage Classics (inglés)',genero:'Filosofía',editorial:'Vintage Books',autores:[['Simone','de Beauvoir']],copias:3,sinopsis:'Examen de la construcción histórica y social de la condición femenina desde perspectivas filosóficas y políticas.'},
 {isbn:'9780812968255',titulo:'Meditations',anio:2003,edicion:'Modern Library, Gregory Hays (inglés)',genero:'Filosofía',editorial:'Modern Library',autores:[['Marco','Aurelio']],copias:3,sinopsis:'Reflexiones del emperador estoico sobre el deber, la virtud, el carácter y la vida en sociedad.'},
 {isbn:'9780140137224',titulo:'Discipline and Punish',anio:1991,edicion:'Penguin Social Sciences (inglés)',genero:'Filosofía',editorial:'Penguin Books',autores:[['Michel','Foucault']],copias:3,sinopsis:'Estudio histórico y filosófico del castigo, la vigilancia y el desarrollo de instituciones disciplinarias.'}
];

const slug=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');
const noContactPrefix='catalogo.',noContactDomain='@autores.myspa.invalid';

function validate(){
 const seen=new Set();
 for(const b of novedades){
  if(!isValidISBN(b.isbn)||seen.has(b.isbn))throw Error(`ISBN inválido/duplicado: ${b.isbn}`);
  if(!Number.isInteger(b.anio)||b.anio<1450||b.anio>new Date().getFullYear()+1)throw Error(`Año inválido para ${b.titulo}`);
  if(!Array.isArray(b.autores)||!b.autores.length||b.autores.some(a=>a.length!==2||!a[0]||!a[1]))throw Error(`Autor inválido: ${b.titulo}`);
  seen.add(b.isbn);
 }
 return `${novedades.length} obras y ${new Set(novedades.flatMap(b=>b.autores.map(a=>a.join(' ')))).size} firmas de autor`;
}

async function main(){
 const summary=validate();
 if(process.argv.includes('--dry-run')){console.log(`Catálogo verificado: ${summary}. No se modificó MySQL.`);return;}
 const [{default:dotenv},{default:mysql}]=await Promise.all([import('dotenv'),import('mysql2/promise')]);
 dotenv.config({path:resolve(ROOT,'.env'),override:true});
 const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD??'',database:process.env.DB_NAME||'myspa',timezone:'Z'});
 let added=0,skipped=0,addedAuthors=0,copies=0;
 try{
  await db.beginTransaction();
  await db.query("SET time_zone = '+00:00'");
  const ids=new Map();
  async function reference(table,name){
   const key=`${table}/${name}`;if(ids.has(key))return ids.get(key);
   await db.execute(`INSERT IGNORE INTO ${table} (nombre) VALUES (?)`,[name]);
   const [[row]]=await db.execute(`SELECT id FROM ${table} WHERE nombre=?`,[name]);
   if(!row)throw Error(`No se pudo localizar ${key}`);ids.set(key,row.id);return row.id;
  }
  async function author(first,last){
   const key=`a/${first} ${last}`;if(ids.has(key))return ids.get(key);
   const marker=`${noContactPrefix}${slug(`${first}.${last}`)}${noContactDomain}`;
   let [[r]]=await db.execute(`SELECT a.id FROM autores a JOIN personas p ON p.id=a.persona_id WHERE p.email=? AND a.activo=1 LIMIT 1`,[marker]);
   if(!r){
    [[r]]=await db.execute(`SELECT a.id FROM autores a JOIN personas p ON p.id=a.persona_id WHERE CONCAT_WS(' ',p.primer_nombre,p.segundo_nombre,p.apellido_paterno)=? AND a.activo=1 ORDER BY a.id LIMIT 1`,[`${first} ${last}`]);
   }
   if(!r){
    const nombres=first.split(/\s+/);
    const [p]=await db.execute('INSERT INTO personas (primer_nombre,segundo_nombre,apellido_paterno,email,pais) VALUES (?,?,?,?,?)',
     [nombres[0],nombres.slice(1).join(' ')||null,last,marker,'No registrado']);
    const [a]=await db.execute('INSERT INTO autores (persona_id,biografia) VALUES (?,?)',[p.insertId,'Autor incluido como referencia bibliográfica. Datos de contacto no disponibles.']);
    r={id:a.insertId};addedAuthors++;
   }
   ids.set(key,r.id);return r.id;
  }
  for(const b of novedades){
   const [[current]]=await db.execute('SELECT id FROM libros WHERE isbn=? LIMIT 1',[b.isbn]);
   if(current){skipped++;continue;}
   const genreId=await reference('generos',b.genero),publisherId=await reference('editoriales',b.editorial);
   const authorIds=[];
   for(const [first,last] of b.autores)authorIds.push(await author(first,last));
   const [insert]=await db.execute('INSERT INTO libros (titulo,anio_publicacion,edicion,isbn,genero_id,editorial_id,sinopsis,portada) VALUES (?,?,?,?,?,?,?,?)',
    [b.titulo,b.anio,b.edicion,b.isbn,genreId,publisherId,b.sinopsis,coverForISBN(b.isbn)]);
   for(const authorId of new Set(authorIds))await db.execute('INSERT INTO libro_autores (libro_id,autor_id) VALUES (?,?)',[insert.insertId,authorId]);
   for(let i=0;i<b.copias;i++){
    await db.execute('INSERT INTO ejemplares (libro_id,codigo) VALUES (?,?)',[insert.insertId,`MYSPA-ISBN-${b.isbn}-${String(i+1).padStart(2,'0')}`]);copies++;
   }
   added++;
  }
  await db.commit();
  console.log(`Catálogo ampliado correctamente: ${added} libros, ${addedAuthors} autores nuevos, ${copies} ejemplares nuevos. ${skipped} ISBN existentes sin tocar.`);
  console.log('Las portadas se solicitan desde Open Library. Si falta alguna, el catálogo usa un diseño de respaldo.');
 }catch(err){await db.rollback();throw err;}finally{await db.end();}
}
main().catch(err=>{console.error('No se actualizó el catálogo:',err.message);process.exitCode=1;});
