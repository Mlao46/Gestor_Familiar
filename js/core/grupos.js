// Grupos: juntan movimientos que van juntos sin tocar categorías ni presupuestos.
//  - evento: una cena, un cumpleaños, un viaje… (lo que pagaste y lo que te devolvieron)
//  - articulo: compraventa en Wallapop (compras, aunque sean en cuotas, y venta)
//  - Las notas de Euroimmun son automáticas: una por mes, a partir del ámbito Euroimmun.
import { mesDe, mesAnterior, norm, redondear, hoyIso } from './util.js';
import { esBizum, mensajeBizum } from './clasificador.js';

export const CLASES = { evento: 'Evento', articulo: 'Artículo de Wallapop' };

const activos = movs => movs.filter(m => !m.borrado && !m.dividido);

export function movsDeGrupo(grupoId, movs) {
  return activos(movs).filter(m => m.grupo === grupoId).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function resumenEvento(g, movs) {
  const ms = movsDeGrupo(g.id, movs);
  let pagado = 0, devuelto = 0;
  for (const m of ms) { if (m.importe < 0) pagado += -m.importe; else devuelto += m.importe; }
  const r = { n: ms.length, pagado: redondear(pagado), devuelto: redondear(devuelto), coste: redondear(pagado - devuelto), faltan: 0, parte: null };
  if (g.personas > 1 && pagado > 0) {
    r.parte = redondear(pagado / g.personas);
    r.faltan = redondear(Math.max(0, pagado - r.parte - devuelto));
  }
  const fechas = ms.map(m => m.fecha);
  r.desde = fechas[0] || null; r.hasta = fechas[fechas.length - 1] || null;
  return r;
}

export function resumenArticulo(g, movs) {
  const ms = movsDeGrupo(g.id, movs);
  const compras = ms.filter(m => m.importe < 0), ventas = ms.filter(m => m.importe > 0);
  const pagado = redondear(compras.reduce((a, m) => a - m.importe, 0));
  const vendido = redondear(ventas.reduce((a, m) => a + m.importe, 0));
  const coste = g.precioCompra > 0 ? g.precioCompra : pagado;
  const pendienteCuotas = g.precioCompra > 0 ? redondear(Math.max(0, g.precioCompra - pagado)) : 0;
  const estaVendido = ventas.length > 0 || g.vendido;
  const primera = compras[0]?.fecha, venta = ventas[ventas.length - 1]?.fecha;
  const dias = primera ? Math.round(((venta ? new Date(venta) : new Date(hoyIso())) - new Date(primera)) / 86400000) : null;
  return {
    n: ms.length, cuotas: compras.length, pagado, vendido, coste, pendienteCuotas,
    vendidoYa: estaVendido, beneficio: estaVendido ? redondear(vendido - coste) : null, dias,
  };
}

export function resumenWallapop(grupos, movs) {
  const arts = grupos.filter(g => g.clase === 'articulo');
  let invertido = 0, enVenta = 0, beneficio = 0, vendidos = 0;
  for (const g of arts) {
    const r = resumenArticulo(g, movs);
    if (r.vendidoYa) { beneficio += r.beneficio; vendidos++; }
    else { invertido += r.pagado; enVenta++; }
  }
  // Movimientos de Wallapop que aún no están en ningún artículo
  const sueltos = activos(movs).filter(m => m.ambito === 'wallapop' && !m.grupo && m.tipo !== 'traspaso');
  return { enVenta, invertido: redondear(invertido), vendidos, beneficio: redondear(beneficio), sueltos: sueltos.length };
}

// ---- Notas de gastos de Euroimmun (una por mes) ----
// Gastos de trabajo: ámbito euroimmun y salida de dinero. Reembolsos: entrada con categoría «Devolución Euroimmun»
// o ámbito euroimmun. El reembolso de un mes llega al siguiente: por defecto se asigna al mes anterior.
export function esGastoTrabajo(m) { return m.ambito === 'euroimmun' && m.importe < 0 && m.tipo !== 'traspaso'; }
export function esReembolsoTrabajo(m) { return m.importe > 0 && m.tipo !== 'traspaso' && (m.cat === 'ing-euroimmun' || m.ambito === 'euroimmun'); }
export function mesNota(m) {
  if (m.notaMes) return m.notaMes;
  return esReembolsoTrabajo(m) ? mesAnterior(mesDe(m.fecha)) : mesDe(m.fecha);
}

export function notasEuroimmun(movs, hoy = hoyIso(), cerradas = {}) {
  const notas = new Map();
  const nota = mes => { if (!notas.has(mes)) notas.set(mes, { mes, gastado: 0, cobrado: 0, gastos: [], cobros: [] }); return notas.get(mes); };
  for (const m of activos(movs)) {
    if (esGastoTrabajo(m)) { const n = nota(mesNota(m)); n.gastado += -m.importe; n.gastos.push(m); }
    else if (esReembolsoTrabajo(m)) { const n = nota(mesNota(m)); n.cobrado += m.importe; n.cobros.push(m); }
  }
  return [...notas.values()].map(n => {
    n.gastado = redondear(n.gastado); n.cobrado = redondear(n.cobrado);
    n.pendiente = redondear(Math.max(0, n.gastado - n.cobrado));
    n.estado = n.gastado === 0 ? 'cobrada' : n.pendiente <= 1 ? 'cobrada' : cerradas[n.mes] ? 'cerrada' : n.cobrado > 0 ? 'parcial' : 'pendiente';
    // Vencida: pendiente 45 días después de acabar el mes
    const [a, mm] = n.mes.split('-').map(Number);
    const limite = new Date(a, mm, 45).toISOString().slice(0, 10);
    n.vencida = (n.estado === 'pendiente' || n.estado === 'parcial') && hoy > limite;
    return n;
  }).sort((a, b) => b.mes.localeCompare(a.mes));
}

// ---- Sugerir a qué grupo va un movimiento ----
export function sugerirGrupo(m, grupos, movs) {
  const abiertos = grupos.filter(g => !g.cerrado);
  if (!abiertos.length) return null;
  if (m.importe > 0 && (m.tipo === 'reembolso' || esBizum(m))) {
    const texto = norm(esBizum(m) ? mensajeBizum(m) : m.desc);
    let mejor = null;
    for (const g of abiertos.filter(x => x.clase === 'evento')) {
      const r = resumenEvento(g, movs);
      const ref = r.desde || (g.creado ? new Date(g.creado).toISOString().slice(0, 10) : m.fecha);
      const dias = (new Date(m.fecha) - new Date(ref)) / 86400000;
      if (dias < -3 || dias > 45) continue;
      const palabras = norm(g.nombre).split(' ').filter(w => w.length >= 4);
      const coincide = palabras.some(w => texto.includes(w));
      const puntos = (coincide ? 100 : 0) - Math.abs(dias);
      if (!mejor || puntos > mejor.puntos) mejor = { g, puntos };
    }
    return mejor?.g || null;
  }
  if (m.importe > 0 && m.ambito === 'wallapop') {
    const enVenta = abiertos.filter(x => x.clase === 'articulo' && !resumenArticulo(x, movs).vendidoYa);
    const texto = norm(m.desc);
    return enVenta.find(g => norm(g.nombre).split(' ').some(w => w.length >= 4 && texto.includes(w))) || null;
  }
  return null;
}
