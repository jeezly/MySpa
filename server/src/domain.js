// Reglas puras y comprobables, sin conexión a MySQL.
export const inDays=(date,n)=>new Date(date.getTime()+n*86400_000);
export const inHours=(date,n)=>new Date(date.getTime()+n*3600_000);
export function normalizeISBN(raw){return String(raw??'').replace(/[\s-]/g,'');}
export function isValidISBN(raw){const x=normalizeISBN(raw);if(!/^\d{13}$/.test(x))return false;
 return x.split('').reduce((sum,d,i)=>sum+Number(d)*(i%2===0?1:3),0)%10===0;}
export function newISBN(seed){const body=`978619${String(seed).padStart(6,'0')}`.slice(0,12);
 const total=body.split('').reduce((s,d,i)=>s+Number(d)*(i%2===0?1:3),0);return body+((10-total%10)%10);}
export const withinLimit=(count)=>Number.isInteger(count)&&count>=0&&count<5;
export const canReserve=(status,verification)=>status==='ACTIVO'&&verification==='VERIFICADO';
export const isExpired=(deadline,now=new Date())=>new Date(deadline).getTime()<=new Date(now).getTime();

// Portadas permitidas: archivos internos subidos con Multer o cubiertas de ISBN en Open Library.
export function coverForISBN(isbn){
 const value=normalizeISBN(isbn);
 if(!isValidISBN(value))throw new TypeError('El ISBN-13 no es válido');
 return `https://covers.openlibrary.org/b/isbn/${value}-L.jpg?default=false`;
}
export function isAllowedCoverUrl(value){
 return value===null || value===undefined || value==='' ||
  (typeof value==='string' && (/^\/api\/media\/[a-f0-9-]{36}$/i.test(value) ||
   /^https:\/\/covers\.openlibrary\.org\/b\/isbn\/\d{13}-L\.jpg\?default=false$/.test(value)));
}
