// Motor de clasificación: reglas tuyas > reglas aprendidas > reglas de la IA > reglas base.
// Cada vez que confirmas un movimiento, la app aprende una regla para la próxima vez.
import { norm, uid } from './util.js';
import { AMBITO_DE_CATEGORIA } from './categorias.js';

const PRIORIDAD = { manual: 3, aprendida: 2, ia: 1 };

export function esBizum(m) { return /^BIZUM (ABONO|CARGO)\b/.test(norm(m.desc)); }

// Persona de un Bizum (aparece tras ORDEN: o BENEF:)
export function personaBizum(m) {
  const d = norm(m.desc);
  return d.match(/(?:ORDEN|BENEF):\s*(.+)$/)?.[1]?.trim() || null;
}

// Mensaje del Bizum sin la persona (lo que escribió quien lo envió)
export function mensajeBizum(m) {
  const d = norm(m.desc);
  const p = personaBizum(m);
  let s = d.replace(/^BIZUM (ABONO|CARGO)\s*/, '').replace(/\s*\.?\s*(ORDEN|BENEF):.*$/, '');
  if (p) {
    // quitar el nombre (a veces partido por el banco)
    const compacto = p.replace(/\s/g, '');
    let i = 0, j = 0;
    while (i < s.length && j < compacto.length) {
      if (s[i] === ' ') { i++; continue; }
      if (s[i] !== compacto[j]) break;
      i++; j++;
    }
    if (j >= Math.min(compacto.length, 8)) s = s.slice(i);
  }
  return s.trim();
}

// Texto de comercio limpio: sin referencias, números de recibo ni códigos de pedido
export function comercio(m) {
  let d = norm(m.desc);
  d = d.replace(/\*[A-Z0-9]{4,}/g, ' ');          // AMAZON.ES*GK5C03QN5 -> AMAZON.ES
  d = d.replace(/\*+\d{4}/g, ' ');                  // ****0084
  d = d.split(' ').filter(t => !(/\d{4,}/.test(t)) && !/^SDD/.test(t) && t.length > 0).join(' ');
  d = d.replace(/[.,;:\-]+$/g, '').trim();
  return d;
}

// Patrón que se guarda al aprender de un movimiento
export function claveAprendizaje(m) {
  if (esBizum(m)) {
    const p = personaBizum(m);
    const dir = norm(m.desc).startsWith('BIZUM ABONO') ? 'BIZUM ABONO' : 'BIZUM CARGO';
    return p ? `${dir} ${p.split(' ').slice(0, 3).join(' ')}` : null;
  }
  const pal = comercio(m).split(' ').filter(Boolean);
  if (!pal.length) return null;
  // Una sola palabra si es distintiva (MERCADONA, AHORRAMAS); si no, dos o tres (EE SS, PAYPAL EUROPE...)
  if (pal[0].length >= 6 && !GENERICAS.has(pal[0])) return pal[0];
  const c = pal.slice(0, pal[0].length <= 3 ? 2 : 3).join(' ');
  return c.length >= 3 ? c : null;
}

// Palabras iniciales que no identifican un comercio por sí solas
const GENERICAS = new Set(['PAYPAL', 'AMAZON', 'AMAZON.ES', 'AMZN', 'GOOGLE', 'APPLE.COM', 'COMPRA', 'RECIBO', 'TRANSFERENCIA',
  'DEVOLUCION', 'IBERCAJA', 'SUMUP', 'ZETTLE', 'PAYCOMET', 'REDSYS', 'ALIEXPRESS', 'CARREFOUR', 'ESTACION', 'GASOLINERA', 'PARKING', 'EUROPE']);
// Intermediarios: el comercio real no aparece, así que no se aprende una regla fija
const INTERMEDIARIOS = /^(PAYPAL|AMAZON\.ES|AMAZON|AMZN|WWW\.AMAZON|TARJ\.VISA|IBERCAJA)\b/;

function signoDe(m) { return m.importe >= 0 ? '+' : '-'; }

function textoBusqueda(m) { return norm(`${m.tipoOp || ''} ${m.desc}`); }

function coincide(regla, m, texto) {
  // El patrón se busca en la descripción; el tipo de operación del banco solo si la regla lo pide
  if (regla.signo && regla.signo !== signoDe(m)) return false;
  if (regla.tipoOp && !norm(m.tipoOp).includes(norm(regla.tipoOp))) return false;
  const pat = norm(regla.patron);
  if (!pat) return false;
  if (pat.startsWith('BIZUM ')) {
    // Para Bizum: dirección + persona, sin importar el orden en que el banco escribe el nombre
    const [, dir, ...persona] = pat.split(' ');
    return norm(m.desc).startsWith(`BIZUM ${dir}`) && persona.every(p => (personaBizum(m) || '').includes(p));
  }
  return norm(m.desc).includes(pat);
}

const KW_REGALO = /\b(CUMPLE|CUMPLEANOS|REGALO|REGALITO|BOTE)\b/;
const KW_COMIDA = /\b(CENA|COMIDA|BURGER|HAMBURGUESA|RESTAURANTE|COPAS|DESAYUNO|CAFE|PIZZA|SUSHI|TAPAS|BRUNCH)\b/;

// Reglas base, de menor prioridad que las tuyas
export function reglaBase(m) {
  const t = norm(m.tipoOp || '');
  const d = norm(m.desc);
  const pos = m.importe > 0;
  if (t.includes('TRANSFERENCIA INTERNA') || /\bTRASPASO\b/.test(d)) return { tipo: 'traspaso', cat: null, motivo: 'Traspaso entre cuentas' };
  if (/NOMINA/.test(d) && pos) return { tipo: 'ingreso', cat: /EUROIMMUN/.test(d) ? 'ing-nomina-mario' : null, motivo: 'Nómina' };
  if (pos && /WALLAPOP|\bWALLA\b/.test(d)) return { tipo: 'ingreso', cat: 'ing-wallapop', ambito: 'wallapop', motivo: 'Venta en Wallapop' };
  if (t.includes('CAJERO')) return pos ? { tipo: 'ingreso', cat: null, motivo: 'Ingreso en cajero' } : { tipo: 'gasto', cat: 'otr-efectivo', motivo: 'Retirada de efectivo' };
  if (t.includes('RECIBO AGUA')) return { tipo: 'gasto', cat: 'viv-agua', motivo: 'Recibo de agua' };
  if (t.includes('RECIBO ENERGIA')) return { tipo: 'gasto', cat: 'viv-luz', motivo: 'Recibo de energía' };
  if (t.includes('RECIBO COMUNIDAD')) return { tipo: 'gasto', cat: 'viv-comunidad', motivo: 'Comunidad' };
  if (t.includes('RECIBO ALQUILER') || /PRESTAMO HIPOTEC/.test(d)) return { tipo: 'gasto', cat: 'viv-hipoteca', motivo: 'Vivienda' };
  if (t.includes('IMPUESTO LOCAL') || /AYUNTAMIENTO/.test(d)) return { tipo: 'gasto', cat: 'viv-ibi', motivo: 'Impuesto municipal' };
  if (t.includes('LIQUIDACION INTERESES')) return { tipo: pos ? 'ingreso' : 'gasto', cat: pos ? 'ing-extras' : 'otr-comisiones', motivo: 'Intereses' };
  if (/COMISION/.test(t) || /COMISION/.test(d)) return { tipo: 'gasto', cat: 'otr-comisiones', motivo: 'Comisión' };
  if (/AMAZON PRIME/.test(d)) return { tipo: 'gasto', cat: 'sus-amazon', motivo: 'Amazon Prime' };
  if (/^TARJ\.VISA \*+0084/.test(d)) return { tipo: 'gasto', cat: 'eur-gastos', ambito: 'euroimmun', motivo: 'Liquidación tarjeta de empresa' };
  if (esBizum(m)) {
    const msg = mensajeBizum(m);
    if (KW_REGALO.test(msg)) return { tipo: pos ? 'reembolso' : 'gasto', cat: 'otr-regalos', motivo: pos ? 'Te devuelven parte de un regalo' : 'Regalo' };
    if (KW_COMIDA.test(msg)) return { tipo: pos ? 'reembolso' : 'gasto', cat: 'ali-restaurantes', motivo: pos ? 'Te devuelven parte de una comida' : 'Comida/cena' };
  }
  if (pos && /TARJETA/.test(t)) return { tipo: 'reembolso', cat: null, motivo: 'Devolución de una compra con tarjeta' };
  return null;
}

/**
 * Clasifica un movimiento.
 * ctx: { reglas: [], tarjetas: {ref4: {nombre, ambito}}, cats: {id: cat} }
 * Devuelve { tipo, cat, ambito, origen, reglaId, fiable, motivo }
 */
export function clasificar(m, ctx) {
  const texto = textoBusqueda(m);
  const tarjeta = m.tarjeta ? ctx.tarjetas?.[m.tarjeta] : null;
  // Liquidación de una tarjeta cuyo detalle se importa aparte: es solo el pago de la tarjeta
  const liq = norm(m.desc).match(/^TARJ\.VISA \*+(\d{4})/);
  const tLiq = liq && ctx.tarjetas?.[liq[1]];
  if (tLiq?.detalleDesde && m.fecha > tLiq.detalleDesde) {
    return { tipo: 'traspaso', cat: null, ambito: 'familia', origen: 'auto', reglaId: null, fiable: true, motivo: `Pago de la tarjeta …${liq[1]} (su detalle se importa aparte)` };
  }
  // Orden: reglas tuyas > reglas base seguras > aprendidas > IA > reglas base dudosas
  const base = reglaBase(m);
  const baseSegura = base && (base.tipo === 'traspaso' || base.cat) ? base : null;
  let mejor = null;
  for (const r of ctx.reglas || []) {
    if (r.borrado || !coincide(r, m, texto)) continue;
    if (baseSegura && r.origen !== 'manual') continue;
    const peso = (PRIORIDAD[r.origen] || 0) * 1000 + norm(r.patron).length;
    if (!mejor || peso > mejor.peso) mejor = { r, peso };
  }
  let res;
  if (mejor) {
    const r = mejor.r;
    const cat = r.cat && ctx.cats?.[r.cat] ? r.cat : null;
    res = {
      tipo: r.tipo || tipoPorDefecto(m, cat, ctx),
      cat,
      ambito: r.ambito || null,
      origen: r.origen === 'ia' ? 'ia' : 'regla',
      reglaId: r.id,
      fiable: r.origen === 'manual' || (r.origen === 'aprendida' && (r.usos || 0) >= 2),
      motivo: `Regla «${r.patron}»`,
    };
  } else if (base) {
    res = { ...base, ambito: base.ambito || null, origen: 'auto', reglaId: null, fiable: !!baseSegura };
  } else {
    res = { tipo: m.importe >= 0 ? 'ingreso' : 'gasto', cat: null, ambito: null, origen: null, reglaId: null, fiable: false, motivo: 'Sin regla' };
  }
  if (res.tipo === 'traspaso') res.cat = null;
  // Ámbito: regla > categoría > tarjeta > familia
  // Si ya hay categoría, manda ella (una compra personal con la tarjeta de empresa es de Familia)
  res.ambito = res.ambito || AMBITO_DE_CATEGORIA[res.cat] || (res.cat ? 'familia' : tarjeta?.ambito) || 'familia';
  if (res.tipo !== 'traspaso' && !res.cat) res.fiable = false;
  return res;
}

function tipoPorDefecto(m, cat, ctx) {
  const c = cat ? ctx.cats?.[cat] : null;
  if (c?.tipo === 'ingreso') return m.importe >= 0 ? 'ingreso' : 'gasto';
  if (c && m.importe > 0) return 'reembolso';
  return m.importe >= 0 ? 'ingreso' : 'gasto';
}

/**
 * Aprende de una confirmación tuya. Devuelve la regla nueva o modificada (o null).
 * Si ya hay una regla con el mismo patrón, la actualiza en lugar de duplicarla.
 */
export function aprender(m, decision, reglas) {
  if (decision.tipo === 'traspaso' && reglaBase(m)?.tipo === 'traspaso') return null; // ya lo sabe
  const b = reglaBase(m);
  if (b && b.cat === (decision.cat || null) && b.tipo === decision.tipo) return null; // las reglas base ya lo resuelven
  const patron = claveAprendizaje(m);
  if (!patron || (INTERMEDIARIOS.test(patron) && !/PRIME/.test(patron))) return null;
  const signo = esBizum(m) ? '' : (m.importe >= 0 ? '+' : '-');
  const existente = reglas.find(r => !r.borrado && norm(r.patron) === norm(patron) && (r.signo || '') === signo);
  const datos = { cat: decision.cat || null, tipo: decision.tipo, ambito: decision.ambito !== 'familia' ? decision.ambito : '' };
  if (existente) {
    const igual = existente.cat === datos.cat && existente.tipo === datos.tipo && (existente.ambito || '') === datos.ambito;
    if (existente.origen === 'manual' && !igual) return null; // no pisar reglas escritas a mano
    return {
      ...existente, ...datos,
      origen: existente.origen === 'manual' ? 'manual' : 'aprendida',
      usos: igual ? (existente.usos || 0) + 1 : 1,
      actualizada: Date.now(),
    };
  }
  return { id: uid('r_'), patron, signo, tipoOp: '', ...datos, origen: 'aprendida', usos: 1, creada: Date.now() };
}
