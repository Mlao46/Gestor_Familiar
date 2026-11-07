// Utilidades comunes sin dependencias.

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

export function uid(prefijo = '') {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return prefijo + Array.from(b, x => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export function redondear(n) { return Math.round(n * 100) / 100; }

export function euros(n, conSigno = false) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (conSigno && v > 0 ? '+' : '') + s + ' €';
}

export function mesDe(fechaIso) { return fechaIso.slice(0, 7); }

export function nombreMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
}

export function mesAnterior(mes, n = 1) {
  let [a, m] = mes.split('-').map(Number);
  m -= n;
  while (m < 1) { m += 12; a--; }
  while (m > 12) { m -= 12; a++; }
  return `${a}-${String(m).padStart(2, '0')}`;
}

export function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Acepta 23-03-2026, 23/03/2026, 2026-03-23, número de serie de Excel o Date
export function parsearFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let a = Number(m[3]); if (a < 100) a += 2000;
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// "1.234,56" -> 1234.56 ; "-20" -> -20 ; 39.96 -> 39.96
export function parsearImporte(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[€\s]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function agruparPor(lista, fn) {
  const m = new Map();
  for (const x of lista) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
