import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../../database/01_schema.sql',import.meta.url),'utf8');
test('Tablas normalizadas para roles, catálogo y circulación',()=>{
 for(const table of ['personas','cuentas','afiliados','autores','libros','libro_autores','ejemplares','prestamos','reservaciones','sesiones','auditoria'])
  assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
});
test('Restricciones de relaciones, índices y baja lógica',()=>{
 assert.match(schema,/FOREIGN KEY/);assert.match(schema,/UNIQUE/);assert.match(schema,/eliminada_en DATETIME NULL/);
 assert.match(schema,/idx_reservaciones_vence/);assert.match(schema,/idx_prestamos_vencimiento/);
});
