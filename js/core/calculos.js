// Cálculos del panel: totales, desglose por categoría, evolución y cuentas aparte (Euroimmun / Wallapop).
import { mesDe, mesAnterior, redondear } from './util.js';

// filtros: { mes?: 'YYYY-MM', ambito?: 'familia'|'wallapop'|'euroimmun'|'todo', tarjeta?: 'todas'|'sin'|ref4, desde?, hasta? }
export function filtrar(movs, f = {}) {
  return movs.filter(m => {
    if (m.borrado) return false;
    if (f.mes && mesDe(m.fecha) !== f.mes) return false;
    if (f.desde && m.fecha < f.desde) return false;
    if (f.hasta && m.fecha > f.hasta) return false;
    if (f.ambito && f.ambito !== 'todo' && (m.ambito || 'familia') !== f.ambito) return false;
    if (f.tarjeta && f.tarjeta !== 'todas') {
      if (f.tarjeta === 'sin' ? !!m.tarjeta : m.tarjeta !== f.tarjeta) return false;
    }
    return true;
  });
}

// Gasto neto de un movimiento (positivo = gasto). Los reembolsos restan.
export function gastoNeto(m) {
  if (m.tipo === 'gasto' || m.tipo === 'reembolso') return -m.importe;
  return 0;
}

export function totales(movs) {
  let ingresos = 0, gastos = 0, reembolsos = 0, traspasos = 0, pendientes = 0;
  for (const m of movs) {
    if (m.estado === 'pendiente') pendientes++;
    if (m.tipo === 'ingreso') ingresos += m.importe;
    else if (m.tipo === 'gasto') gastos += -m.importe;
    else if (m.tipo === 'reembolso') reembolsos += m.importe;
    else if (m.tipo === 'traspaso') traspasos += m.importe;
  }
  const gastoNetoTotal = gastos - reembolsos;
  return {
    ingresos: redondear(ingresos), gastos: redondear(gastoNetoTotal), gastosBrutos: redondear(gastos),
    reembolsos: redondear(reembolsos), traspasos: redondear(traspasos),
    balance: redondear(ingresos - gastoNetoTotal), pendientes,
  };
}

// Desglose por grupo y categoría. cats = lista de categorías.
export function porCategoria(movs, cats, { meses = 1 } = {}) {
  const porId = Object.fromEntries(cats.map(c => [c.id, c]));
  const acc = new Map();
  for (const m of movs) {
    if (m.tipo !== 'gasto' && m.tipo !== 'reembolso') continue;
    const id = m.cat && porId[m.cat] ? m.cat : '_sin';
    const a = acc.get(id) || { id, neto: 0, n: 0, movs: [] };
    a.neto += gastoNeto(m); a.n++; a.movs.push(m);
    acc.set(id, a);
  }
  const grupos = new Map();
  for (const a of acc.values()) {
    const c = porId[a.id] || { id: '_sin', grupo: 'Sin categoría (por revisar)', nombre: 'Sin categoría', presupuesto: 0 };
    const g = grupos.get(c.grupo) || { grupo: c.grupo, neto: 0, presupuesto: 0, cats: [] };
    const pres = (c.presupuesto || 0) * meses;
    g.cats.push({ ...c, neto: redondear(a.neto), n: a.n, presupuesto: pres, movs: a.movs });
    g.neto += a.neto;
    grupos.set(c.grupo, g);
  }
  // Presupuestos de categorías sin movimientos también cuentan
  for (const c of cats) {
    if (c.tipo !== 'gasto' || !c.presupuesto || acc.has(c.id)) continue;
    const g = grupos.get(c.grupo) || { grupo: c.grupo, neto: 0, presupuesto: 0, cats: [] };
    g.cats.push({ ...c, neto: 0, n: 0, presupuesto: c.presupuesto * meses, movs: [] });
    grupos.set(c.grupo, g);
  }
  const lista = [...grupos.values()].map(g => {
    g.neto = redondear(g.neto);
    g.presupuesto = g.cats.reduce((s, c) => s + c.presupuesto, 0);
    g.cats.sort((a, b) => b.neto - a.neto);
    return g;
  });
  return lista.sort((a, b) => b.neto - a.neto);
}

export function ingresosPorCategoria(movs, cats) {
  const porId = Object.fromEntries(cats.map(c => [c.id, c]));
  const acc = new Map();
  for (const m of movs) {
    if (m.tipo !== 'ingreso') continue;
    const id = m.cat && porId[m.cat] ? m.cat : '_sin';
    const a = acc.get(id) || { id, nombre: porId[id]?.nombre || 'Sin categoría', total: 0, n: 0, movs: [] };
    a.total += m.importe; a.n++; a.movs.push(m);
    acc.set(id, a);
  }
  return [...acc.values()].map(a => ({ ...a, total: redondear(a.total) })).sort((a, b) => b.total - a.total);
}

export function mesesConDatos(movs) {
  return [...new Set(movs.filter(m => !m.borrado).map(m => mesDe(m.fecha)))].sort().reverse();
}

// Evolución de los últimos n meses hasta 'mesFin' (incluido)
export function evolucion(movs, mesFin, n = 12, cats = []) {
  const meses = [];
  for (let i = n - 1; i >= 0; i--) meses.push(mesAnterior(mesFin, i));
  const porMes = new Map(meses.map(k => [k, []]));
  for (const m of movs) { const k = mesDe(m.fecha); if (porMes.has(k)) porMes.get(k).push(m); }
  const porId = Object.fromEntries(cats.map(c => [c.id, c]));
  return meses.map(k => {
    const t = totales(porMes.get(k));
    const grupos = {};
    for (const m of porMes.get(k)) {
      if (m.tipo !== 'gasto' && m.tipo !== 'reembolso') continue;
      const g = porId[m.cat]?.grupo || 'Sin categoría';
      grupos[g] = redondear((grupos[g] || 0) + gastoNeto(m));
    }
    return { mes: k, ...t, grupos, vacio: porMes.get(k).length === 0 };
  });
}

// Media mensual de gasto por categoría en los últimos n meses con datos (para sugerir presupuestos)
export function mediasPorCategoria(movs, mesFin, n = 6) {
  const meses = new Set();
  for (let i = 0; i < n; i++) meses.add(mesAnterior(mesFin, i));
  const conDatos = new Set(movs.filter(m => meses.has(mesDe(m.fecha))).map(m => mesDe(m.fecha)));
  const div = Math.max(conDatos.size, 1);
  const acc = {};
  for (const m of movs) {
    if (!meses.has(mesDe(m.fecha)) || !m.cat) continue;
    if (m.tipo !== 'gasto' && m.tipo !== 'reembolso') continue;
    acc[m.cat] = (acc[m.cat] || 0) + gastoNeto(m);
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, redondear(v / div)]));
}

// Cuenta aparte: lo gastado y lo recuperado en un ámbito (Euroimmun: lo que te deben; Wallapop: beneficio)
export function cuentaAparte(movs, ambito) {
  const lista = movs.filter(m => !m.borrado && m.ambito === ambito && m.tipo !== 'traspaso');
  let salidas = 0, entradas = 0;
  for (const m of lista) { if (m.importe < 0) salidas += -m.importe; else entradas += m.importe; }
  return { salidas: redondear(salidas), entradas: redondear(entradas), saldo: redondear(entradas - salidas), n: lista.length };
}
