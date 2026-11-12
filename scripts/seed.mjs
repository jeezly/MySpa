import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, createIndexes, closeDB, collection, nextId, withTransaction } from '../server/src/db.js';
import { coverForISBN, inDays, inHours, isValidISBN, newISBN } from '../server/src/domain.js';
import { hashPassword, insertPerson, parse, passwordSchema } from '../server/src/core.js';

// Hashes of the four original demo accounts (no plaintext credentials in this package).
const LEGACY_DEMO_HASHES = {
  "SEED_ADMIN_PASSWORD": "scrypt$16384$8$1$c9722f7eeb851caeb62b1d380b1b6b87$0395332d5e8698eedd7490bb9b3c8aa46e7011c53478332ae0511739b80497f0e0cb041c177536f60a4bffd4327c1772cbce3dae3dd3cadbdca45624d0dc7bbf",
  "SEED_STAFF_PASSWORD": "scrypt$16384$8$1$016d5b2727a4e5434e6f712e27c87a16$107e07d4a568b990b677fab159576653c182021bb138c342ea0ce19a28acf48dd0f92602f5e1f2501db9519ec9ebe33005c9460f02040e81250b97214c5db339",
  "SEED_AFFILIATE_PASSWORD": "scrypt$16384$8$1$59683a461f6c86e17d110fdb9bfed538$3a67fc52677f2b92e821d3e1df31203c033afbda4b0c9a9ab06e578ab9760ce524777c0de8c26faad01bc963b24dc0eba8590b5bb3fea475022b2e4b31caac7e",
  "SEED_PENDING_PASSWORD": "scrypt$16384$8$1$1ef922ccc942686031fec173934a00fe$58b81f38186a6229e07e569dab1146c9393afee5427bbafdeaa3da52e44231f14245df357245199417d98c0e440852573125cbc6f358085b7c6a80b9acdc88b6"
};

const originalAuthors = [
  ['Valeria', 'Mendoza', 'Narrativa de lo cotidiano, los recuerdos y las ciudades.'],
  ['Emilio', 'Salcedo', 'Historias de descubrimiento científico para lectores curiosos.'],
  ['Luna', 'Arriaga', 'Ficción especulativa y viajes por mundos imaginarios.'],
  ['Diego', 'Robles', 'Ensayo contemporáneo sobre cultura, pensamiento y arte.'],
  ['Camila', 'Paredes', 'Explora la poesía, la identidad y la naturaleza.'],
  ['Mateo', 'Beltrán', 'Autor de suspenso y relatos de misterio.'],
  ['Sofía', 'Carranza', 'Escritora de literatura juvenil y aventuras.'],
  ['Nicolás', 'Reyes', 'Divulgación tecnológica y futuros posibles.'],
];

const initialGenres = ['Narrativa', 'Fantasía', 'Divulgación', 'Poesía', 'Misterio'];
const initialPublishers = [
  'Editorial Horizonte',
  'Libros del Sur',
  'Casa del Saber',
  'Viento Editorial',
  'Nido de Tinta',
];

const originalBooks = [
  [
    'El jardín de las páginas',
    2022,
    1,
    1,
    [1],
    'Una librería escondida guarda recuerdos que nadie se atreve a contar.'
  ],
  ['Atlas de medianoche', 2024, 2, 2, [3], 'Los mapas cambian cuando la ciudad se queda dormida.'],
  [
    'Manual de futuros posibles',
    2025,
    3,
    3,
    [8, 2],
    'Ciencia, tecnología y decisiones para el mundo que viene.'
  ],
  [
    'El rumor de las montañas',
    2020,
    1,
    4,
    [5],
    'Poemas sobre aquello que permanece cuando todo cambia.'
  ],
  ['El último faro', 2021, 5, 2, [6], 'Un misterio junto al mar: la luz aparece una noche más.'],
  [
    'La ciudad de las luciérnagas',
    2023,
    1,
    1,
    [1, 7],
    'Dos generaciones descubren un secreto entre las calles.'
  ],
  [
    'Constelaciones de papel',
    2024,
    2,
    5,
    [7],
    'Una aventura para quienes todavía creen en lo imposible.'
  ],
  ['Preguntas para mañana', 2025, 3, 3, [4], 'Ideas breves para pensar la cultura y el presente.'],
  ['Horizontes invisibles', 2022, 2, 2, [3], 'Un viaje hacia un lugar que no figura en ningún mapa.'],
  [
    'Código y conciencia',
    2026,
    3,
    3,
    [8],
    'Una guía accesible a los dilemas de la inteligencia artificial.'
  ],
  [
    'El puente de los ecos',
    2019,
    5,
    1,
    [6, 1],
    'Nadie recuerda quién construyó el puente en la madrugada.'
  ],
  [
    'Botánica de las emociones',
    2021,
    4,
    4,
    [5],
    'Versos para aprender a mirar el paisaje desde adentro.'
  ],
  [
    'El archivo del viento',
    2023,
    1,
    2,
    [2, 7],
    'La respuesta a un enigma científico cabe en una vieja carta.'
  ],
  ['La hora de los relojes', 2026, 5, 5, [6], 'El tiempo desaparece durante sesenta segundos.'],
  ['Luces sobre el agua', 2024, 4, 1, [1], 'Una novela íntima sobre empezar de nuevo.'],
];

// Las 18 obras que antes vivían en ampliar-catalogo.mjs están aquí.
const extraBooks =
  [
    {
      isbn: "9780785124924",
      titulo: "Ultimate Spider-Man: Ultimate Collection, Vol. 1",
      anio: 2007,
      edicion: "Ultimate Collection, vol. 1",
      genero: "Cómics",
      editorial: "Marvel Comics",
      autores: [["Brian Michael", "Bendis"], ["Mark", "Bagley"]],
      copias: 3,
      sinopsis: "Peter Parker descubre sus poderes y aprende lo que significa ser Spider-Man en una reinterpretación moderna del personaje.",
    },
    {
      isbn: "9780760761335",
      titulo: "Ultimate Spider-Man Collection",
      anio: 2004,
      edicion: "Colección integral, tapa dura",
      genero: "Cómics",
      editorial: "Barnes & Noble Books",
      autores: [["Brian Michael", "Bendis"], ["Mark", "Bagley"]],
      copias: 2,
      sinopsis: "Antología de las primeras aventuras de Ultimate Spider-Man, reunidas en una edición de colección.",
    },
    {
      isbn: "9780446389235",
      titulo: "Batman: Year One",
      anio: 1988,
      edicion: "Edición DC Comics",
      genero: "Cómics",
      editorial: "DC Comics",
      autores: [["Frank", "Miller"], ["David", "Mazzucchelli"]],
      copias: 2,
      sinopsis: "Los primeros meses de Bruce Wayne como Batman y el comienzo de la carrera de Jim Gordon en Gotham.",
    },
    {
      isbn: "9781401219260",
      titulo: "Watchmen",
      anio: 2008,
      edicion: "DC Comics, tapa dura (inglés)",
      genero: "Novela gráfica",
      editorial: "DC Comics",
      autores: [["Alan", "Moore"], ["Dave", "Gibbons"]],
      copias: 2,
      sinopsis: "Una investigación entre vigilantes enmascarados revela tensiones políticas, éticas y personales en un mundo al borde de la catástrofe.",
    },
    {
      isbn: "9780590353427",
      titulo: "Harry Potter and the Sorcerer's Stone",
      anio: 1999,
      edicion: "Scholastic Paperbacks (inglés)",
      genero: "Novela fantástica",
      editorial: "Scholastic Paperbacks",
      autores: [["J. K.", "Rowling"]],
      copias: 4,
      sinopsis: "Harry descubre que es mago y comienza sus estudios en Hogwarts, donde encontrará amistad, misterios y una amenaza inesperada.",
    },
    {
      isbn: "9780439064873",
      titulo: "Harry Potter and the Chamber of Secrets",
      anio: 1999,
      edicion: "Scholastic Trade Paperback (inglés)",
      genero: "Novela fantástica",
      editorial: "Scholastic",
      autores: [["J. K.", "Rowling"]],
      copias: 3,
      sinopsis: "En su segundo año en Hogwarts, Harry investiga una serie de ataques relacionados con una cámara legendaria.",
    },
    {
      isbn: "9780439136358",
      titulo: "Harry Potter and the Prisoner of Azkaban",
      anio: 1999,
      edicion: "Scholastic, tapa dura (inglés)",
      genero: "Novela fantástica",
      editorial: "Scholastic",
      autores: [["J. K.", "Rowling"]],
      copias: 3,
      sinopsis: "Un prisionero fugitivo, los dementores y un secreto del pasado transforman el tercer año de Harry en Hogwarts.",
    },
    {
      isbn: "9780547928227",
      titulo: "The Hobbit",
      anio: 2012,
      edicion: "Mariner, tapa blanda (inglés)",
      genero: "Novela fantástica",
      editorial: "Mariner Books",
      autores: [["J. R. R.", "Tolkien"]],
      copias: 4,
      sinopsis: "Bilbo Bolsón abandona la Comarca y emprende una expedición con enanos hacia la Montaña Solitaria.",
    },
    {
      isbn: "9780544003415",
      titulo: "The Lord of the Rings",
      anio: 2012,
      edicion: "50.º aniversario, tomo único (inglés)",
      genero: "Novela fantástica",
      editorial: "Houghton Mifflin",
      autores: [["J. R. R.", "Tolkien"]],
      copias: 4,
      sinopsis: "Frodo y sus compañeros deben atravesar la Tierra Media para destruir el Anillo Único y enfrentar la sombra de Sauron.",
    },
    {
      isbn: "9780441172719",
      titulo: "Dune",
      anio: 1990,
      edicion: "Ace, tapa blanda (inglés)",
      genero: "Ciencia ficción",
      editorial: "Ace Books",
      autores: [["Frank", "Herbert"]],
      copias: 4,
      sinopsis: "La disputa por Arrakis y la especia sitúa a Paul Atreides en el centro de una intriga política, ecológica y religiosa.",
    },
    {
      isbn: "9780143106265",
      titulo: "The Communist Manifesto",
      anio: 2011,
      edicion: "Penguin Classics (inglés)",
      genero: "Pensamiento político",
      editorial: "Penguin Classics",
      autores: [["Karl", "Marx"], ["Friedrich", "Engels"]],
      copias: 3,
      sinopsis: "Marx y Engels exponen su interpretación de la lucha de clases, las transformaciones históricas y el capitalismo industrial.",
    },
    {
      isbn: "9780140445688",
      titulo: "Capital: Volume One",
      anio: 1990,
      edicion: "Penguin Classics, volumen I (inglés)",
      genero: "Filosofía",
      editorial: "Penguin Books",
      autores: [["Karl", "Marx"]],
      copias: 3,
      sinopsis: "Análisis crítico de la mercancía, el valor, el trabajo y las relaciones sociales de producción capitalistas.",
    },
    {
      isbn: "9780140449143",
      titulo: "The Republic",
      anio: 2003,
      edicion: "Penguin Classics, 2.ª ed. (inglés)",
      genero: "Filosofía",
      editorial: "Penguin Classics",
      autores: [["Platón", "de Atenas"]],
      copias: 3,
      sinopsis: "Diálogo filosófico sobre justicia, educación, conocimiento, política y la organización de la ciudad.",
    },
    {
      isbn: "9780140449235",
      titulo: "Beyond Good and Evil",
      anio: 2003,
      edicion: "Penguin Classics (inglés)",
      genero: "Filosofía",
      editorial: "Penguin Classics",
      autores: [["Friedrich", "Nietzsche"]],
      copias: 3,
      sinopsis: "Crítica de la moral tradicional, de los prejuicios filosóficos y de las formas establecidas de valorar el mundo.",
    },
    {
      isbn: "9780143039884",
      titulo: "Eichmann in Jerusalem",
      anio: 2006,
      edicion: "Penguin Classics (inglés)",
      genero: "Pensamiento político",
      editorial: "Penguin Classics",
      autores: [["Hannah", "Arendt"]],
      copias: 3,
      sinopsis: "Análisis del juicio de Adolf Eichmann y reflexión sobre responsabilidad individual, burocracia y banalidad del mal.",
    },
    {
      isbn: "9780099499381",
      titulo: "The Second Sex",
      anio: 2010,
      edicion: "Vintage Classics (inglés)",
      genero: "Filosofía",
      editorial: "Vintage Books",
      autores: [["Simone", "de Beauvoir"]],
      copias: 3,
      sinopsis: "Examen de la construcción histórica y social de la condición femenina desde perspectivas filosóficas y políticas.",
    },
    {
      isbn: "9780812968255",
      titulo: "Meditations",
      anio: 2003,
      edicion: "Modern Library, Gregory Hays (inglés)",
      genero: "Filosofía",
      editorial: "Modern Library",
      autores: [["Marco", "Aurelio"]],
      copias: 3,
      sinopsis: "Reflexiones del emperador estoico sobre el deber, la virtud, el carácter y la vida en sociedad.",
    },
    {
      isbn: "9780140137224",
      titulo: "Discipline and Punish",
      anio: 1991,
      edicion: "Penguin Social Sciences (inglés)",
      genero: "Filosofía",
      editorial: "Penguin Books",
      autores: [["Michel", "Foucault"]],
      copias: 3,
      sinopsis: "Estudio histórico y filosófico del castigo, la vigilancia y el desarrollo de instituciones disciplinarias.",
    },
  ];

function slug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

function randomPassword() {
  return `Spa-${crypto.randomBytes(12).toString('base64url')}Aa9!`;
}

function personData(first, last, email, extra = {}) {
  return {
    primer_nombre: first,
    apellido_paterno: last,
    email,
    pais: 'México',
    ...extra,
  };
}

async function reference(name, value) {
  const found = await collection(name).findOne({ nombre: value });
  if (found) return found.id;
  const id = await nextId(name);
  await collection(name).insertOne({ id, nombre: value });
  return id;
}

async function author(first, last, bio = null) {
  const email = `catalogo.${slug(`${first}.${last}`)}@autores.myspa.invalid`;
  const person = await collection('personas').findOne({ email });
  if (person) {
    const existing = await collection('autores').findOne({ persona_id: person.id });
    if (existing) return existing.id;
  }

  return withTransaction(async (session) => {
    const personId = await insertPerson(session, personData(first, last, email, {
      pais: 'No registrado',
    }));
    const id = await nextId('autores', session);
    await collection('autores').insertOne({
      id,
      persona_id: personId,
      biografia: bio || 'Autor incluido como referencia bibliográfica. Datos de contacto no disponibles.',
      activo: true,
    }, { session });
    return id;
  });
}

async function addBook(book) {
  if (!isValidISBN(book.isbn)) throw Error(`ISBN inválido: ${book.isbn}`);
  const existing = await collection('libros').findOne({ isbn: book.isbn });
  if (existing) return false;

  const genreId = await reference('generos', book.genero);
  const publisherId = await reference('editoriales', book.editorial);
  const authorIds = [];
  for (const [first, last] of book.autores) {
    authorIds.push(await author(first, last, book.biografia));
  }

  await withTransaction(async (session) => {
    const id = await nextId('libros', session);
    await collection('libros').insertOne({
      id,
      titulo: book.titulo,
      anio_publicacion: book.anio,
      edicion: book.edicion,
      isbn: book.isbn,
      genero_id: genreId,
      editorial_id: publisherId,
      autor_ids: [...new Set(authorIds)],
      sinopsis: book.sinopsis,
      portada: book.portada || null,
      activo: true,
      creado_en: new Date(),
    }, { session });

    for (let index = 0; index < book.copias; index++) {
      const copyId = await nextId('ejemplares', session);
      const codigo = `MYSPA-ISBN-${book.isbn}-${String(index + 1).padStart(2, '0')}`;
      await collection('ejemplares').insertOne({
        id: copyId,
        libro_id: id,
        codigo,
        estatus: 'DISPONIBLE',
        adquirido_en: new Date(),
      }, { session });
    }
  });
  return true;
}

async function addDemoUser(first, last, email, role, options = {}) {
  if (await collection('cuentas').findOne({ email })) return null;
  const password = options.passwordHash
    ? null
    : parse(passwordSchema, options.password || randomPassword());
  const hash = options.passwordHash || await hashPassword(password);
  await withTransaction(async (session) => {
    const personId = await insertPerson(session, personData(first, last, email));
    const id = await nextId('cuentas', session);
    await collection('cuentas').insertOne({
      id,
      persona_id: personId,
      email,
      password_hash: hash,
      rol: role,
      habilitada: true,
      eliminada_en: null,
      ultimo_acceso: null,
      creada_en: new Date(),
    }, { session });
    if (role === 'AFILIADO') {
      const verified = options.verified !== false;
      await collection('afiliados').insertOne({
        cuenta_id: id,
        estatus: 'ACTIVO',
        verificacion: verified ? 'VERIFICADO' : 'PENDIENTE',
        documento_tipo: verified ? 'INE' : null,
        verificado_por: null,
        verificado_en: verified ? new Date() : null,
      }, { session });
    }
  });
  return { email, password };
}

async function seedDemoCirculation() {
  const [affiliate, librarian] = await Promise.all([
    collection('cuentas').findOne({ email: 'afiliado@myspa.local' }),
    collection('cuentas').findOne({ email: 'bibliotecario@myspa.local' }),
  ]);

  if (!affiliate || !librarian) return;

  await withTransaction(async (session) => {
    const existingLoan = await collection('prestamos').findOne(
      { afiliado_id: affiliate.id },
      { session },
    );
    const existingReservation = await collection('reservaciones').findOne(
      { afiliado_id: affiliate.id },
      { session },
    );

    if (!existingLoan) {
      const book = await collection('libros').findOne(
        { isbn: newISBN(100), activo: true },
        { session },
      );
      if (book) {
        const copy = await collection('ejemplares').findOneAndUpdate(
          { libro_id: book.id, estatus: 'DISPONIBLE' },
          { $set: { estatus: 'PRESTADO' } },
          { sort: { id: 1 }, returnDocument: 'after', session },
        );
        if (copy) {
          const id = await nextId('prestamos', session);
          const now = new Date();
          await collection('prestamos').insertOne({
            id,
            afiliado_id: affiliate.id,
            ejemplar_id: copy.id,
            reservacion_id: null,
            prestado_por: librarian.id,
            devuelto_por: null,
            inicio_en: now,
            vence_en: inDays(now, 7),
            devuelto_en: null,
          }, { session });
        }
      }
    }

    if (!existingReservation) {
      const book = await collection('libros').findOne(
        { isbn: newISBN(102), activo: true },
        { session },
      );
      if (book) {
        const copy = await collection('ejemplares').findOneAndUpdate(
          { libro_id: book.id, estatus: 'DISPONIBLE' },
          { $set: { estatus: 'RESERVADO' } },
          { sort: { id: 1 }, returnDocument: 'after', session },
        );
        if (copy) {
          const id = await nextId('reservaciones', session);
          const now = new Date();
          await collection('reservaciones').insertOne({
            id,
            afiliado_id: affiliate.id,
            libro_id: book.id,
            ejemplar_id: copy.id,
            estatus: 'ACTIVA',
            creada_en: now,
            vence_en: inHours(now, 24),
            terminada_en: null,
          }, { session });
        }
      }
    }
  });
}

async function seed() {
  const isbnSet = new Set();
  for (let index = 0; index < originalBooks.length; index++) {
    isbnSet.add(newISBN(index + 100));
  }
  for (const item of extraBooks) {
    if (!isValidISBN(item.isbn) || isbnSet.has(item.isbn)) {
      throw Error(`ISBN inválido o duplicado: ${item.isbn}`);
    }
    isbnSet.add(item.isbn);
  }

  if (process.argv.includes('--check')) {
    console.log(`Catálogo válido: ${isbnSet.size} obras. No se modificó Atlas.`);
    return;
  }

  await connectDB();
  await createIndexes();

  const createdAccounts = [];
  const demoUsers = [
    ['Andrea', 'Directora', 'admin@myspa.local', 'ADMIN', 'SEED_ADMIN_PASSWORD', true],
    [
      'Marco',
      'Bibliotecario',
      'bibliotecario@myspa.local',
      'BIBLIOTECARIO',
      'SEED_STAFF_PASSWORD',
      true
    ],
    ['Alex', 'Lector', 'afiliado@myspa.local', 'AFILIADO', 'SEED_AFFILIATE_PASSWORD', true],
    ['Daniela', 'PorVerificar', 'pendiente@myspa.local', 'AFILIADO', 'SEED_PENDING_PASSWORD', false],
  ];
  for (const [first, last, email, role, key, verified] of demoUsers) {
    const result = await addDemoUser(first, last, email, role, {
      password: process.env[key] || null,
      passwordHash: process.env[key] ? null : LEGACY_DEMO_HASHES[key],
      verified,
    });
    if (result) createdAccounts.push(result);
  }

  for (const name of [...initialGenres, 'Historia', 'Tecnología']) {
    await reference('generos', name);
  }
  for (const name of initialPublishers) {
    await reference('editoriales', name);
  }
  for (const [first, last, bio] of originalAuthors) {
    await author(first, last, bio);
  }

  let added = 0;
  for (let index = 0; index < originalBooks.length; index++) {
    const [titulo, anio, genre, publisher, authorNumbers, sinopsis] = originalBooks[index];
    const entry = {
      isbn: newISBN(index + 100),
      titulo,
      anio,
      edicion: 'Primera',
      genero: initialGenres[genre - 1],
      editorial: initialPublishers[publisher - 1],
      autores: authorNumbers.map((number) => originalAuthors[number - 1].slice(0, 2)),
      copias: 3 + index % 3,
      sinopsis,
    };
    if (await addBook(entry)) added++;
  }
  for (const item of extraBooks) {
    if (await addBook({ ...item, portada: coverForISBN(item.isbn) })) added++;
  }

  await seedDemoCirculation();

  console.log(`Seed completo: ${added} libros nuevos; ${isbnSet.size} títulos previstos.`);
  if (createdAccounts.length) {
    console.log('Cuentas demo creadas: usa las contraseñas originales de CREDENCIALES_LOCALES.txt.');
    console.log('Consérvalas fuera del repositorio. El ZIP no incluye contraseñas en texto plano.');
  } else {
    console.log('Las cuentas demo ya existían y no se modificaron.');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  seed().catch((error) => {
    console.error('[SEED]', error.message);
    process.exitCode = 1;
  }).finally(closeDB);
}
