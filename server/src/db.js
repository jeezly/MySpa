import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MongoClient, ServerApiVersion } from 'mongodb';

dotenv.config({
  path: resolve(fileURLToPath(new URL('../../.env', import.meta.url))),
});

let client = null;
let database = null;
let connecting = null;

export async function connectDB() {
  if (database) return database;
  if (connecting) return connecting;

  connecting = (async () => {
    const uri = process.env.MONGODB_URI?.trim();
    if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri)) {
      throw new Error('Configura MONGODB_URI en el archivo .env');
    }

    const instance = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    try {
      await instance.connect();
      const db = instance.db(process.env.MONGODB_DB_NAME || 'myspa');
      await db.command({ ping: 1 });
      client = instance;
      database = db;
      return db;
    } catch (error) {
      await instance.close();
      throw error;
    }
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export function getDB() {
  if (!database) throw new Error('MongoDB no está conectado');
  return database;
}

export function collection(name) {
  return getDB().collection(name);
}

export async function nextId(name, session) {
  const counter = await collection('contadores').findOneAndUpdate(
    { _id: name },
    { $inc: { valor: 1 } },
    {
      upsert: true,
      returnDocument: 'after',
      ...(session ? { session } : {}),
    },
  );
  if (!counter) throw new Error(`No se pudo generar el ID: ${name}`);
  return counter.valor;
}

export async function withTransaction(handler) {
  if (!client) throw new Error('MongoDB no está conectado');
  const session = client.startSession();
  try {
    return await session.withTransaction(
      () => handler(session),
      {
        readPreference: 'primary',
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }
}

export async function createIndexes() {
  const primary = [
    'personas',
    'cuentas',
    'afiliados',
    'autores',
    'generos',
    'editoriales',
    'libros',
    'ejemplares',
    'reservaciones',
    'prestamos',
    'sesiones',
    'auditoria',
    'archivos',
  ];

  // También crea todas las colecciones vacías antes de usar transacciones.
  for (const name of primary) {
    await collection(name).createIndex({ id: 1 }, { unique: true, sparse: true });
  }
  await collection('contadores').createIndex({ valor: 1 });

  await collection('cuentas').createIndex({ email: 1 }, { unique: true });
  await collection('cuentas').createIndex({ persona_id: 1 }, { unique: true });
  await collection('afiliados').createIndex({ cuenta_id: 1 }, { unique: true });
  await collection('autores').createIndex({ persona_id: 1 }, { unique: true });
  await collection('generos').createIndex({ nombre: 1 }, { unique: true });
  await collection('editoriales').createIndex({ nombre: 1 }, { unique: true });
  await collection('libros').createIndex({ isbn: 1 }, { unique: true });
  await collection('libros').createIndex({ titulo: 1 });
  await collection('ejemplares').createIndex({ codigo: 1 }, { unique: true });
  await collection('ejemplares').createIndex({ libro_id: 1, estatus: 1 });
  await collection('reservaciones').createIndex({ estatus: 1, vence_en: 1 });
  await collection('reservaciones').createIndex(
    { ejemplar_id: 1 },
    { unique: true, partialFilterExpression: { estatus: 'ACTIVA' } },
  );
  await collection('reservaciones').createIndex(
    { afiliado_id: 1, libro_id: 1 },
    { unique: true, partialFilterExpression: { estatus: 'ACTIVA' } },
  );
  await collection('prestamos').createIndex({ afiliado_id: 1, devuelto_en: 1 });
  await collection('prestamos').createIndex({ devuelto_en: 1, vence_en: 1 });
  await collection('prestamos').createIndex(
    { ejemplar_id: 1 },
    { unique: true, partialFilterExpression: { devuelto_en: null } },
  );
  await collection('sesiones').createIndex({ token_hash: 1 }, { unique: true });
  await collection('sesiones').createIndex({ expira_en: 1 }, { expireAfterSeconds: 0 });
  await collection('auditoria').createIndex({ creado_en: -1 });
  await collection('archivos').createIndex({ tipo: 1, entidad_id: 1 });
}

export async function closeDB() {
  const instance = client;
  client = null;
  database = null;
  connecting = null;
  if (instance) await instance.close();
}
