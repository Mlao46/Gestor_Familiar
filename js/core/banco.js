// Convierte la tabla de un extracto bancario en movimientos normalizados.
// Probado con "Detalle de movimientos de cuenta" de IberCaja; detecta columnas por nombre para otros bancos.
import { norm, parsearFecha, parsearImporte, redondear } from './util.js';

const SINONIMOS = {
  fecha: ['FECHA OPER', 'FECHA OPERACION', 'F. OPERACION', 'FECHA', 'FECHA CONTABLE'],
  fechaValor: ['FECHA VALOR', 'F. VALOR'],
  tipoOp: ['CONCEPTO'],
  desc: ['DESCRIPCION', 'CONCEPTO AMPLIADO', 'DETALLE', 'MOVIMIENTO'],
  ref: ['REFERENCIA', 'REF.'],
  importe: ['IMPORTE', 'IMPORTE EUR', 'IMPORTE (EUR)', 'CANTIDAD'],
  cargo: ['CARGO', 'CARGOS', 'DEBE'],
  abono: ['ABONO', 'ABONOS', 'HABER'],
  saldo: ['SALDO', 'SALDO (EUR)'],
};

function buscarCabecera(filas) {
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const c = (filas[i] || []).map(norm);
    const tieneFecha = c.some(x => x.startsWith('FECHA'));
    const tieneImporte = c.some(x => SINONIMOS.importe.includes(x) || SINONIMOS.cargo.includes(x));
    if (tieneFecha && tieneImporte) return i;
  }
  return -1;
}

function mapearColumnas(cab) {
  const c = cab.map(norm);
  const idx = {};
  for (const [campo, nombres] of Object.entries(SINONIMOS)) {
    for (const n of nombres) {
      const i = c.indexOf(n);
      if (i >= 0 && !Object.values(idx).includes(i)) { idx[campo] = i; break; }
    }
  }
  // Si solo hay "Concepto" (sin descripción), el concepto es la descripción
  if (idx.desc == null && idx.tipoOp != null) { idx.desc = idx.tipoOp; delete idx.tipoOp; }
  return idx;
}

function detectarCuenta(filas, hasta) {
  for (let i = 0; i < hasta; i++) {
    for (const v of filas[i] || []) {
      const m = String(v ?? '').match(/\*{2,}\s?(\d{4})\b/) || String(v ?? '').match(/\bES\d{2}[\d ]{16,}(\d{4})\b/);
      if (m) return '…' + m[1];
    }
  }
  return null;
}

export function ultimos4(ref) {
  const s = String(ref ?? '').replace(/\.0+$/, '').replace(/\D/g, '');
  return s.length >= 4 ? s.slice(-4) : null;
}

// Clave para detectar duplicados: fecha|importe|descripción|nº de repetición en el mismo extracto
export function claveDuplicado(m, ocurrencia = 0) {
  return `${m.fecha}|${m.importe.toFixed(2)}|${norm(m.desc)}|${ocurrencia}`;
}

export function parsearExtracto(filas, { tarjeta = null } = {}) {
  const ic = buscarCabecera(filas);
  if (ic < 0) throw new Error('No encuentro la fila de títulos (Fecha / Importe). ¿Es el extracto de movimientos?');
  const idx = mapearColumnas(filas[ic]);
  if (idx.fecha == null || idx.desc == null || (idx.importe == null && idx.cargo == null)) {
    throw new Error('Faltan columnas: necesito al menos Fecha, Concepto/Descripción e Importe');
  }
  const cuenta = detectarCuenta(filas, ic);
  const movs = [];
  const avisos = [];
  for (let i = ic + 1; i < filas.length; i++) {
    const f = filas[i] || [];
    if (!f.some(v => v != null && v !== '')) continue;
    const fecha = parsearFecha(f[idx.fecha]);
    let importe = idx.importe != null ? parsearImporte(f[idx.importe]) : null;
    if (importe == null && idx.cargo != null) {
      const cargo = parsearImporte(f[idx.cargo]) || 0;
      const abono = idx.abono != null ? (parsearImporte(f[idx.abono]) || 0) : 0;
      importe = abono - Math.abs(cargo);
    }
    if (!fecha || importe == null || importe === 0) {
      if (importe !== 0 && (fecha || importe)) avisos.push(`Fila ${i + 1} ignorada (sin fecha o importe)`);
      continue;
    }
    const tipoOp = idx.tipoOp != null ? norm(f[idx.tipoOp]) : '';
    const desc = String(f[idx.desc] ?? '').replace(/\s+/g, ' ').trim();
    const esTarjeta = /TARJETA|TARJ\b|VISA|MASTERCARD/.test(tipoOp) || /^TARJ\.VISA/.test(norm(desc));
    let ref4 = null;
    if (esTarjeta) ref4 = ultimos4(idx.ref != null ? f[idx.ref] : null) || norm(desc).match(/\*{2,}(\d{4})/)?.[1] || null;
    movs.push({
      fecha,
      fechaValor: idx.fechaValor != null ? parsearFecha(f[idx.fechaValor]) : null,
      tipoOp,
      desc,
      tarjeta: ref4,
      importe: redondear(importe),
      saldo: idx.saldo != null ? parsearImporte(f[idx.saldo]) : null,
      cuenta,
      fila: i + 1,
    });
  }
  // Extracto de una tarjeta de crédito: las compras suelen venir en positivo
  if (tarjeta) {
    const positivos = movs.filter(m => m.importe > 0).length;
    const invertir = positivos > movs.length / 2;
    for (const m of movs) {
      if (invertir) m.importe = -m.importe;
      m.tarjeta = tarjeta; m.tipoOp = m.tipoOp || 'TARJETA CREDITO'; m.saldo = null; m.extractoTarjeta = true;
    }
  }
  // Ocurrencias para no confundir dos movimientos idénticos el mismo día
  const vistos = new Map();
  for (const m of movs) {
    const base = claveDuplicado(m, 0);
    const n = vistos.get(base) || 0;
    vistos.set(base, n + 1);
    m.h = (tarjeta ? `T${tarjeta}|` : '') + claveDuplicado(m, n);
  }
  // Comprobación con saldos. El banco no siempre ordena los movimientos de un mismo día como
  // su saldo, así que se comprueba día a día: cada día debe poder encadenarse desde el saldo
  // final del día anterior en algún orden.
  let saldoOk = null;
  const conSaldo = movs.filter(m => m.saldo != null);
  if (conSaldo.length > 1 && !tarjeta) {
    let fallos = 0;
    const dias = new Map();
    for (const m of conSaldo) { if (!dias.has(m.fecha)) dias.set(m.fecha, []); dias.get(m.fecha).push(m); }
    const fechas = [...dias.keys()].sort();
    const encadenar = (inicio, grupo) => {
      let actual = inicio; const quedan = [...grupo];
      while (quedan.length) {
        const i = quedan.findIndex(m => Math.abs(redondear(actual + m.importe) - m.saldo) <= 0.011);
        if (i < 0) return null;
        actual = quedan[i].saldo; quedan.splice(i, 1);
      }
      return actual;
    };
    let previo = null;
    for (const f of fechas) {
      const grupo = dias.get(f);
      let fin = null;
      if (previo == null) {
        for (const m of grupo) { fin = encadenar(redondear(m.saldo - m.importe), grupo); if (fin != null) break; }
      } else fin = encadenar(previo, grupo);
      if (fin == null) {
        fallos++;
        // Seguir desde el saldo que cuadra con el total del día
        const total = grupo.reduce((a, m) => a + m.importe, 0);
        fin = grupo.find(m => previo != null && Math.abs(redondear(previo + total) - m.saldo) <= 0.011)?.saldo
          ?? (dias.get(f)[0].saldo);
      }
      previo = fin;
    }
    saldoOk = fallos === 0;
    if (fallos) avisos.push(`${fallos} día(s) donde el saldo no cuadra: puede que el extracto esté incompleto o que falten movimientos`);
  }
  const fechas = movs.map(m => m.fecha).sort();
  const saldoFinal = conSaldo.length ? conSaldo.reduce((a, b) => (b.fecha > a.fecha ? b : a)).saldo : null;
  return { movs, cuenta, desde: fechas[0], hasta: fechas[fechas.length - 1], saldoOk, saldoFinal, avisos };
}
