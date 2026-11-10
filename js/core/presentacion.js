// Cómo se presenta cada movimiento: nombre legible, icono y color de su categoría.
import { norm } from './util.js';
import { comercio, esBizum, personaBizum, mensajeBizum } from './clasificador.js';

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'al', 'por', 'para', 'con']);
const SIGLAS = new Set(['SL', 'SA', 'SLU', 'S.L.', 'S.A.', 'AEAT', 'DGT', 'IKEA', 'BBVA', 'ING', 'UTE', 'ONCE', 'HM', 'BP']);
const CONOCIDOS = [
  [/^EE ?SS\b/, 'Gasolinera'], [/^E\.S\.\s/, 'Gasolinera'],
  [/^AMAZON PRIME/, 'Amazon Prime'], [/^(AMAZON|AMZN|WWW\.AMAZON)/, 'Amazon'],
  [/^PAYPAL/, 'PayPal'], [/^MERCADONA/, 'Mercadona'], [/^CANAL DE ISABEL/, 'Canal de Isabel II'],
  [/^AYUNTAMIENTO DE MAD/, 'Ayuntamiento de Madrid'], [/AGENCIA E AEAT|AEAT/, 'Agencia Tributaria'],
  [/^IBERDROLA/, 'Iberdrola'], [/^NETFLIX/, 'Netflix'], [/^SPOTIFY/, 'Spotify'], [/^SHEIN/, 'Shein'],
  [/^UBER \*?ONE/, 'Uber One'], [/^UBER/, 'Uber'], [/^GOOGLE/, 'Google'], [/^APPLE\.COM/, 'Apple'],
];

function capitalizar(texto) {
  return texto.toLowerCase().split(' ').filter(Boolean).map((w, i) => {
    const W = w.toUpperCase();
    if (SIGLAS.has(W)) return W;
    if (i > 0 && MINUSCULAS.has(w)) return w;
    return w.replace(/^(\p{L})/u, c => c.toUpperCase()).replace(/([.\-/'])(\p{L})/gu, (m, s, c) => s + c.toUpperCase());
  }).join(' ');
}

function primerNombre(persona) {
  const p = (persona || '').split(' ')[0] || '';
  return capitalizar(p);
}

/**
 * Nombre legible de un movimiento. alias: { claveComercio: 'Nombre' } definidos por el usuario.
 */
export function nombreBonito(m, alias = {}) {
  if (m.nombre) return m.nombre;
  const d = norm(m.desc);
  const t = norm(m.tipoOp);
  if (esBizum(m)) {
    const quien = primerNombre(personaBizum(m));
    const recibido = d.startsWith('BIZUM ABONO');
    return quien ? (recibido ? `Bizum de ${quien}` : `Bizum a ${quien}`) : (recibido ? 'Bizum recibido' : 'Bizum enviado');
  }
  if (t.includes('CAJERO')) return m.importe < 0 ? 'Retirada en cajero' : 'Ingreso en cajero';
  if (/^TARJ\.VISA \*+(\d{4})/.test(d)) return `Liquidación tarjeta …${d.match(/\*+(\d{4})/)[1]}`;
  if (/\bTRASPASO\b/.test(d) || t.includes('TRANSFERENCIA INTERNA')) return 'Traspaso entre cuentas';
  if (/NOMINA/.test(d) && m.importe > 0) return 'Nómina';
  const clave = comercio(m);
  if (alias[clave]) return alias[clave];
  for (const [re, nombre] of CONOCIDOS) if (re.test(d)) return nombre;
  // Si el banco ya lo escribe con mayúsculas y minúsculas, se respeta
  if (/[a-z]/.test(m.desc) && /[A-Z]/.test(m.desc) && m.desc.length < 40) return m.desc.trim();
  let pal = clave.replace(/\\.*$/, '').replace(/\*/g, ' ').replace(/[,;]/g, ' ').split(' ').filter(Boolean);
  while (pal.length > 1 && /^(S\.?L\.?U?|S\.?A\.?|SLU|SL|SA)$/.test(pal[pal.length - 1])) pal.pop();
  pal = pal.slice(0, 5);
  while (pal.length > 1 && MINUSCULAS.has(pal[pal.length - 1].toLowerCase())) pal.pop();
  if (!pal.length) return capitalizar(m.desc.slice(0, 40)) || 'Movimiento';
  return capitalizar(pal.join(' '));
}

// Línea secundaria: mensaje de Bizum o texto original abreviado
export function detalleOriginal(m) {
  if (esBizum(m)) { const msg = mensajeBizum(m); return msg ? `«${capitalizar(msg).slice(0, 60)}»` : ''; }
  return '';
}

// ---- Iconos (trazos de 24×24) ----
export const ICONO = {
  casa: 'M4 11l8-7 8 7M6 10v10h12V10',
  luz: 'M13 2L5 14h6l-1 8 8-12h-6z',
  agua: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  comunidad: 'M4 20V8l8-4 8 4v12M9 20v-6h6v6',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  reforma: 'M14 6l4 4-9 9H5v-4zM12 8l4 4',
  escudo: 'M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z',
  llama: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .5 2 2 3 2.5 3 0-3-1-5 0-8z',
  limpieza: 'M8 3h8l-1 5H9zM7 8h10l1 13H6zM10 12v5M14 12v5',
  coche: 'M5 16h14M6 16l1.5-5h9L18 16M6 16v3M18 16v3M8 13.5h.01M16 13.5h.01',
  gasolina: 'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h13M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h5',
  parking: 'M6 21V3h7a5 5 0 0 1 0 10H6',
  llave: 'M14 7a4 4 0 1 1-4 4M10 11l-7 7v3h3l7-7',
  cesta: 'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9 20h.01M17 20h.01',
  cubiertos: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2.5-3 6h3v12',
  globo: 'M12 3a5 5 0 0 1 5 5c0 3.5-3 6-5 6s-5-2.5-5-6a5 5 0 0 1 5-5zM12 14v7',
  birrete: 'M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5',
  ola: 'M2 18c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1M8 15V5a2 2 0 0 1 4 0M16 15V5',
  musica: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
  camiseta: 'M8 4l4 2 4-2 4 3-2 3-2-1v11H8V9L6 10 4 7z',
  repetir: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  corazon: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  cruz: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  diente: 'M8 3c-3 0-4 3-3 6l2 11h2l1-5h4l1 5h2l2-11c1-3 0-6-3-6-2 0-2 1-4 1S10 3 8 3z',
  ticket: 'M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z',
  avion: 'M2 16l20-6-6 12-3-5-5 3 1-5z',
  arbol: 'M12 3l7 12H5zM12 15v6',
  cubo: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  billete: 'M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9h.01M18 15h.01',
  etiqueta: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
  regalo: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3-5 0M12 7c1.5-3 5-3 5 0',
  movil: 'M7 2h10v20H7zM11 18h2',
  hucha: 'M5 11a7 6 0 0 1 13-2h2v4l-2 1v3h-3v2h-3v-2H9v2H6v-3a6 6 0 0 1-1-5zM14 9h.01',
  banco: 'M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18',
  maletin: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  cambio: 'M7 7h11l-3-3M17 17H6l3 3',
  euro: 'M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10h9M4 14h9',
  bebe: 'M12 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM9.5 11h.01M14.5 11h.01M10 14.5a3 3 0 0 0 4 0M12 4V2',
  sin: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01',
};

// Color e icono por grupo (fondo suave, color del icono)
export const GRUPOS = {
  'Vivienda': { icono: 'casa', bg: '#E3F0F2', fg: '#1C6672' },
  'Coche': { icono: 'coche', bg: '#E8EEF8', fg: '#2453A0' },
  'Alimentación': { icono: 'cesta', bg: '#E3EFEA', fg: '#0F5C4A' },
  'Niños': { icono: 'globo', bg: '#FBEFE3', fg: '#9A4410' },
  'Suscripciones': { icono: 'repetir', bg: '#EEF0E0', fg: '#596112' },
  'Salud': { icono: 'corazon', bg: '#FBE9EC', fg: '#A3283E' },
  'Ocio': { icono: 'ticket', bg: '#F2EAF7', fg: '#6B3FA0' },
  'Otros': { icono: 'etiqueta', bg: '#EFEEEA', fg: '#4A4C52' },
  'Euroimmun': { icono: 'maletin', bg: '#E8EEF8', fg: '#2453A0' },
  'Wallapop': { icono: 'cubo', bg: '#E1F3F1', fg: '#0E6B62' },
  'Ingresos': { icono: 'euro', bg: '#E5EEFB', fg: '#1D58B8' },
};
const OTROS_COLORES = [
  { bg: '#F6EEDB', fg: '#7A5A0A' }, { bg: '#E9F0E3', fg: '#3F6420' }, { bg: '#F7E8F0', fg: '#8E2F62' }, { bg: '#E6ECF5', fg: '#36557F' },
];

// Icono concreto por categoría (si no, el del grupo)
const ICONO_CAT = {
  'viv-luz': 'luz', 'viv-agua': 'agua', 'viv-comunidad': 'comunidad', 'viv-internet': 'wifi', 'viv-mobiliario': 'reforma',
  'viv-seguro': 'escudo', 'viv-calefaccion': 'llama', 'viv-limpieza': 'limpieza', 'viv-ibi': 'banco',
  'coc-gasolina': 'gasolina', 'coc-garaje': 'parking', 'coc-mantenimiento': 'llave', 'coc-seguro': 'escudo', 'coc-impuesto': 'banco',
  'ali-restaurantes': 'cubiertos', 'nin-colegio': 'birrete', 'nin-infantil': 'bebe', 'nin-piscina': 'ola', 'nin-musica': 'musica',
  'nin-ropa': 'camiseta', 'otr-ropa': 'camiseta', 'sal-fisio': 'cruz', 'sal-dentista': 'diente', 'sal-farmacia': 'cruz',
  'oci-viajes': 'avion', 'oci-parques': 'arbol', 'oci-impresora': 'cubo', 'otr-efectivo': 'billete', 'otr-regalos': 'regalo',
  'otr-electronica': 'movil', 'otr-ahorro': 'hucha', 'otr-comisiones': 'banco', 'eur-gastos': 'maletin', 'wal-compras': 'cubo',
  'ing-wallapop': 'cubo', 'ing-euroimmun': 'maletin', 'ing-nomina-mario': 'euro', 'ing-nomina-lorena': 'euro',
};

export function estiloGrupo(grupo) {
  if (GRUPOS[grupo]) return GRUPOS[grupo];
  let h = 0; for (const c of grupo || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { icono: 'etiqueta', ...OTROS_COLORES[h % OTROS_COLORES.length] };
}

export function estiloCategoria(cat) {
  if (!cat) return { icono: 'sin', bg: '#F1EFE9', fg: '#6B6E74' };
  const g = estiloGrupo(cat.grupo);
  return { ...g, icono: cat.icono || ICONO_CAT[cat.id] || g.icono };
}

export function estiloMovimiento(m, cat) {
  if (m.tipo === 'traspaso') return { icono: 'cambio', bg: '#EFEEEA', fg: '#4A4C52' };
  if (esBizum(m) && !cat) return { icono: 'cambio', bg: '#EFEEEA', fg: '#4A4C52' };
  return estiloCategoria(cat);
}

export function svgIcono(nombre, tam = 20, grosor = 1.8) {
  const d = ICONO[nombre] || ICONO.etiqueta;
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
