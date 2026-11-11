import test from 'node:test';
import assert from 'node:assert/strict';
import {inDays,inHours,normalizeISBN,isValidISBN,newISBN,withinLimit,canReserve,isExpired} from '../src/domain.js';
test('ISBN-13: valida el dígito verificador y normaliza separadores',()=>{
 assert.equal(isValidISBN('978-0-306-40615-7'),true);
 assert.equal(normalizeISBN(' 978-0-306-40615-7 '),'9780306406157');
 assert.equal(isValidISBN('9780306406158'),false);
 assert.equal(isValidISBN('123'),false);
 for(let n=0;n<100;n++)assert.equal(isValidISBN(newISBN(n)),true);
});
test('Los límites de vigencia son 24 horas y 7 días exactos',()=>{
 const start=new Date('2026-11-10T12:34:00.000Z');
 assert.equal(inHours(start,24).toISOString(),'2026-11-11T12:34:00.000Z');
 assert.equal(inDays(start,7).toISOString(),'2026-11-17T12:34:00.000Z');
 assert.equal(isExpired(inHours(start,24),inHours(start,24)),true);
 assert.equal(isExpired(inHours(start,24),inHours(start,23)),false);
});
test('El quinto préstamo es el límite permitido',()=>{
 assert.equal(withinLimit(0),true);assert.equal(withinLimit(4),true);assert.equal(withinLimit(5),false);assert.equal(withinLimit(-1),false);
});
test('Solo afiliados activos y verificados pueden reservar',()=>{
 assert.equal(canReserve('ACTIVO','VERIFICADO'),true);
 for(const status of ['BAJA','PENALIZADO'])assert.equal(canReserve(status,'VERIFICADO'),false);
 for(const verified of ['PENDIENTE','RECHAZADO'])assert.equal(canReserve('ACTIVO',verified),false);
});
