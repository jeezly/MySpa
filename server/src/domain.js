export const inDays = (date, n) => new Date(date.getTime() + n * 86_400_000);
export const inHours = (date, n) => new Date(date.getTime() + n * 3_600_000);

export function normalizeISBN(raw) {
  return String(raw ?? '').replace(/[\s-]/g, '');
}

export function isValidISBN(raw) {
  const isbn = normalizeISBN(raw);
  if (!/^\d{13}$/.test(isbn)) return false;
  const total = [...isbn].reduce(
    (sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  return total % 10 === 0;
}

export function newISBN(seed) {
  const body = `978619${String(seed).padStart(6, '0')}`.slice(0, 12);
  const total = [...body].reduce(
    (sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  return `${body}${(10 - (total % 10)) % 10}`;
}

export const withinLimit = (n) => Number.isInteger(n) && n >= 0 && n < 5;
export const canReserve = (s, v) => s === 'ACTIVO' && v === 'VERIFICADO';
export const isExpired = (until, now = new Date()) => new Date(until) <= now;

export function coverForISBN(isbn) {
  const value = normalizeISBN(isbn);
  if (!isValidISBN(value)) throw new TypeError('ISBN-13 inválido');
  return `https://covers.openlibrary.org/b/isbn/${value}-L.jpg?default=false`;
}

export function isAllowedCoverUrl(value) {
  return value == null || value === '' || (
    typeof value === 'string' && (
      /^\/api\/media\/[a-f0-9-]{36}$/i.test(value) ||
      /^https:\/\/covers\.openlibrary\.org\/b\/isbn\/\d{13}-L\.jpg\?default=false$/.test(value)
    )
  );
}
