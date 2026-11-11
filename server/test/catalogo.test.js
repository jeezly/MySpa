import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {coverForISBN,isAllowedCoverUrl} from '../src/domain.js';

const root=resolve(import.meta.dirname,'../..');
test('Las portadas solo aceptan imágenes internas y enlaces controlados de ISBN',()=>{
 const real=coverForISBN('9780590353427');
 assert.equal(real,'https://covers.openlibrary.org/b/isbn/9780590353427-L.jpg?default=false');
 assert.equal(isAllowedCoverUrl(real),true);
 assert.equal(isAllowedCoverUrl('/api/media/12ab3456-7f90-4d11-890a-abcdef123456'),true);
 assert.equal(isAllowedCoverUrl('javascript:alert(1)'),false);
 assert.equal(isAllowedCoverUrl('https://example.com/image.jpg'),false);
 assert.equal(isAllowedCoverUrl('https://covers.openlibrary.org/b/isbn/123-L.jpg?default=false'),false);
 assert.throws(()=>coverForISBN('9780590353428'));
});

test('El catálogo de obras reales pasa el verificador sin tocar la base de datos',()=>{
 const run=spawnSync(process.execPath,[resolve(root,'scripts/ampliar-catalogo.mjs'),'--dry-run'],{cwd:root,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/18 obras y 17 firmas de autor/);
 assert.match(run.stdout,/No se modificó MySQL/);
});

test('El importador usa ISBN único, transacciones y evita reinsertar ejemplares',async()=>{
 const source=await readFile(resolve(root,'scripts/ampliar-catalogo.mjs'),'utf8');
 assert.match(source,/SELECT id FROM libros WHERE isbn=\?/);
 assert.match(source,/if\(current\)\{skipped\+\+;continue;\}/);
 assert.match(source,/beginTransaction\(\)/);
 assert.match(source,/commit\(\)/);
 assert.match(source,/rollback\(\)/);
});
