// Pantallas: Inicio, Revisar, Movimientos, Evolución, Importar y Más.
import { esc, $, $$, aviso, hoja, confirmar, fechaCorta, fechaLarga, elegirArchivo, ICONOS } from './ui.js';
import { euros, nombreMes, mesAnterior, mesDe, hoyIso, norm, agruparPor, MESES } from './core/util.js';
import { filtrar, totales, porCategoria, ingresosPorCategoria, evolucion, cuentaAparte, gastoNeto, mediasPorCategoria } from './core/calculos.js';
import { AMBITOS, TIPOS } from './core/categorias.js';
import { claveAprendizaje } from './core/clasificador.js';
import { nombreBonito, detalleOriginal, estiloCategoria, estiloMovimiento, estiloGrupo, svgIcono } from './core/presentacion.js';
import { resumenEvento, resumenArticulo, resumenWallapop, notasEuroimmun, movsDeGrupo, mesNota, esGastoTrabajo, esReembolsoTrabajo } from './core/grupos.js';

const AMBITOS_FILTRO = { familia: 'Familia', wallapop: 'Wallapop', euroimmun: 'Euroimmun', todo: 'Todo' };
const COLORES_PERSONA = ['#0F5C4A', '#1D58B8', '#9A4410', '#6B3FA0', '#596112'];

// ---------- Piezas comunes ----------
export function icono(estilo, tam = '') {
  const px = tam === 'pq' ? 16 : tam === 'gr' ? 28 : 20;
  return `<span class="ic ${tam}" style="background:${estilo.bg};color:${estilo.fg}">${svgIcono(estilo.icono, px)}</span>`;
}
const alias = app => app.servicio.ajustes.alias || {};
const catsPorId = app => Object.fromEntries(app.servicio.catsTodas.map(c => [c.id, c]));

function tarjetasUsadas(app) {
  const usadas = new Set(app.servicio.movs.map(m => m.tarjeta).filter(Boolean));
  return app.servicio.tarjetas.filter(t => usadas.has(t.id.slice(2))).sort((a, b) => a.id.localeCompare(b.id));
}
// Mismo color para cada tarjeta en toda la app
function colorTarjeta(app, ref4) {
  const ts = tarjetasUsadas(app).filter(t => t.ambito !== 'euroimmun');
  const i = ts.findIndex(t => t.id === 't_' + ref4);
  return COLORES_PERSONA[(i < 0 ? ts.length : i) % COLORES_PERSONA.length];
}
function inicial(nombre) { return (nombre || '?').replace(/^Tarjeta\s*…?/, '').trim().charAt(0).toUpperCase() || '·'; }

function botonPersona(app) {
  const ts = tarjetasUsadas(app).filter(t => t.ambito !== 'euroimmun');
  if (!ts.length) return '';
  const sel = app.filtros.tarjeta;
  const elegida = ts.find(t => t.id.slice(2) === sel);
  const av = elegida ? [elegida] : ts.slice(0, 3);
  return `<button class="avatares" data-acc="persona" aria-label="Filtrar por tarjeta: ${esc(elegida ? elegida.nombre : 'todas')}">
    ${av.map(t => `<span class="avatar" style="background:${colorTarjeta(app, t.id.slice(2))}">${esc(inicial(t.nombre))}</span>`).join('')}
  </button>`;
}

function elegirPersona(app) {
  const ts = tarjetasUsadas(app);
  const op = (v, t, color, ini) => `<button class="boton-cat" data-v="${esc(v)}" style="margin-top:8px">${color ? `<span class="avatar" style="background:${color};border:0">${esc(ini)}</span>` : icono({ icono: 'cambio', bg: 'var(--superficie-2)', fg: 'var(--texto-2)' }, 'pq')}<span class="t">${esc(t)}</span>${app.filtros.tarjeta === v ? ICONOS.check : ''}</button>`;
  const h = hoja(`<h2>¿De quién?</h2><p class="suave" style="margin:0">Filtra por la tarjeta con la que se pagó. Ponles nombre en Ajustes › Tarjetas.</p>
    ${op('todas', 'Todos los gastos')}
    ${ts.map(t => op(t.id.slice(2), `${t.nombre}${t.nombre.includes('…') ? '' : ` (…${t.id.slice(2)})`}`, colorTarjeta(app, t.id.slice(2)), inicial(t.nombre))).join('')}
    ${op('sin', 'Sin tarjeta: recibos, Bizum y transferencias')}`);
  $$('[data-v]', h.el).forEach(b => b.onclick = () => { app.filtros.tarjeta = b.dataset.v; app.guardarFiltros(); h.cerrar(); app.render(); });
}

function pestanasAmbito(app) {
  return `<div class="pestanas" role="tablist" aria-label="Ámbito">${Object.entries(AMBITOS_FILTRO).map(([k, v]) =>
    `<button class="pestana ${app.filtros.ambito === k ? 'activa' : ''}" role="tab" aria-selected="${app.filtros.ambito === k}" data-ambito="${k}">${v}</button>`).join('')}</div>`;
}

function navMes(app, etiqueta) {
  const [a, m] = app.filtros.mes.split('-').map(Number);
  const anioActual = new Date().getFullYear();
  return `<div class="mes-nav">
    <button class="boton" data-mes="-1" aria-label="Mes anterior">${ICONOS.izq}</button>
    <h1>${esc(etiqueta || MESES[m - 1])}${a !== anioActual ? ` <span class="suave" style="font-weight:500">${a}</span>` : ''}</h1>
    <button class="boton" data-mes="1" aria-label="Mes siguiente">${ICONOS.der}</button>
  </div>`;
}

function enlazarComunes(app, c) {
  $$('[data-mes]', c).forEach(b => b.onclick = () => { app.filtros.mes = mesAnterior(app.filtros.mes, -Number(b.dataset.mes)); app.guardarFiltros(); app.render(); });
  $$('[data-ambito]', c).forEach(b => b.onclick = () => { app.filtros.ambito = b.dataset.ambito; app.guardarFiltros(); app.render(); });
  c.querySelector('[data-acc=persona]')?.addEventListener('click', () => elegirPersona(app));
}

// ===================== GRUPOS: piezas comunes =====================
const ESTILO_EVENTO = { icono: 'regalo', bg: '#FBE9EC', fg: '#A3283E' };
const ESTILO_ARTICULO = { icono: 'cubo', bg: '#E1F3F1', fg: '#0E6B62' };
const ESTILO_NOTA = { icono: 'maletin', bg: '#E8EEF8', fg: '#2453A0' };
const nombreMesCorto = mes => MESES[Number(mes.slice(5)) - 1].toLowerCase();

function lineaGrupo(app, g) {
  if (g.clase === 'evento') {
    const r = resumenEvento(g, app.servicio.movs);
    const det = r.faltan > 0 ? `Faltan ${euros(r.faltan)} por devolver` : `Pagaste ${euros(r.pagado)} · te devolvieron ${euros(r.devuelto)}`;
    return { estilo: ESTILO_EVENTO, titulo: g.nombre, valor: euros(r.coste), sub: `Coste real · ${det}` };
  }
  const r = resumenArticulo(g, app.servicio.movs);
  if (r.vendidoYa) return { estilo: ESTILO_ARTICULO, titulo: g.nombre, valor: euros(r.beneficio, true), sub: `Vendido por ${euros(r.vendido)} · costó ${euros(r.coste)}${r.dias != null ? ` · ${r.dias} días` : ''}`, color: r.beneficio >= 0 ? 'var(--marca)' : 'var(--mal)' };
  return { estilo: ESTILO_ARTICULO, titulo: g.nombre, valor: euros(r.pagado), sub: `En venta · ${r.cuotas} pago${r.cuotas !== 1 ? 's' : ''}${r.pendienteCuotas ? ` · quedan ${euros(r.pendienteCuotas)} de cuotas` : ''}` };
}

function filaGrupo(app, g) {
  const l = lineaGrupo(app, g);
  return `<a class="cat-fila" href="#/grupo?id=${esc(g.id)}">${icono(l.estilo)}<span class="cuerpo"><span class="linea"><span class="n">${esc(l.titulo)}</span><span class="v num" ${l.color ? `style="color:${l.color}"` : ''}>${l.valor}</span></span><span class="det">${esc(l.sub)}</span></span></a>`;
}

// Bloque «Abierto» del inicio: solo lo que está pendiente
function bloqueAbierto(app) {
  const s = app.servicio;
  const filas = [];
  for (const g of s.grupos.filter(x => !x.cerrado && x.clase === 'evento')) {
    const r = resumenEvento(g, s.movs);
    if (r.n) filas.push(filaGrupo(app, g));
  }
  const notas = notasEuroimmun(s.movs, hoyIso(), s.ajustes.notasCerradas || {}).filter(n => n.vencida);
  for (const n of notas.slice(0, 3)) filas.push(`<a class="cat-fila" href="#/grupos?tab=euroimmun">${icono(ESTILO_NOTA)}<span class="cuerpo"><span class="linea"><span class="n">Nota de ${esc(nombreMesCorto(n.mes))}</span><span class="v num">${euros(n.pendiente)}</span></span><span class="det" style="color:var(--aviso)">Sin cobrar desde hace más de 45 días</span></span></a>`);
  const w = resumenWallapop(s.grupos, s.movs);
  if (w.enVenta) filas.push(`<a class="cat-fila" href="#/grupos?tab=wallapop">${icono(ESTILO_ARTICULO)}<span class="cuerpo"><span class="linea"><span class="n">${w.enVenta} artículo${w.enVenta > 1 ? 's' : ''} en venta</span><span class="v num">${euros(w.invertido)}</span></span><span class="det">Dinero invertido en Wallapop pendiente de vender</span></span></a>`);
  if (!filas.length) return '';
  return `<section class="tarjeta"><div class="tarjeta-cab"><h2>Abierto</h2><a href="#/grupos">Ver todo</a></div>${filas.slice(0, 6).join('')}</section>`;
}

// Elegir o crear un grupo para unos movimientos
export function elegirGrupo(app, { actual = null, clasePreferida = 'evento', movIds = [] } = {}) {
  return new Promise(ok => {
    const s = app.servicio;
    const abiertos = s.grupos.filter(g => !g.cerrado).sort((a, b) => (b.creado || 0) - (a.creado || 0));
    const fila = g => `<button class="boton-cat" data-g="${esc(g.id)}" style="margin-top:8px">${icono(g.clase === 'evento' ? ESTILO_EVENTO : ESTILO_ARTICULO, 'pq')}<span class="t">${esc(g.nombre)}<br><span class="tenue">${g.clase === 'evento' ? 'Evento' : 'Wallapop'}</span></span>${g.id === actual ? ICONOS.check : ''}</button>`;
    const h = hoja(`<h2>Grupo</h2><p class="suave" style="margin:0">Junta movimientos que van juntos. No cambia las categorías ni el presupuesto.</p>
      ${abiertos.length ? `<p class="grupo-titulo">Abiertos</p>${abiertos.map(fila).join('')}` : ''}
      <p class="grupo-titulo">Nuevo</p>
      <form data-nuevo>
        <div class="segmentado" data-clase><button type="button" data-v="evento">Evento</button><button type="button" data-v="articulo">Artículo Wallapop</button></div>
        <label class="campo"><span>Nombre</span><input type="text" name="nombre" required placeholder="p. ej. Cena cumple Lucas"></label>
        <label class="campo" data-solo="evento"><span>Personas que pagan a partes iguales (opcional)</span><input type="number" name="personas" min="2" step="1" inputmode="numeric"></label>
        <label class="campo" data-solo="articulo"><span>Precio total de compra (opcional, si lo pagas a plazos)</span><input type="number" name="precio" min="0" step="0.01" inputmode="decimal"></label>
        <div class="botones"><button class="boton primario grande" style="flex:1">Crear y asignar</button>${actual ? '<button type="button" class="boton grande" data-quitar>Quitar del grupo</button>' : ''}</div>
      </form>`, { alCerrar: () => ok(undefined) });
    let clase = clasePreferida;
    const pintar = () => {
      $$('[data-clase] button', h.el).forEach(b => b.classList.toggle('activo', b.dataset.v === clase));
      $$('[data-solo]', h.el).forEach(x => x.classList.toggle('oculto', x.dataset.solo !== clase));
      $('[name=nombre]', h.el).placeholder = clase === 'evento' ? 'p. ej. Cena cumple Lucas' : 'p. ej. Bicicleta de montaña';
    };
    pintar();
    $$('[data-clase] button', h.el).forEach(b => b.onclick = () => { clase = b.dataset.v; pintar(); });
    $$('[data-g]', h.el).forEach(b => b.onclick = async () => { await s.asignarGrupo(movIds, b.dataset.g); h.el.parentElement.remove(); ok(b.dataset.g); });
    h.el.querySelector('[data-quitar]')?.addEventListener('click', async () => { await s.asignarGrupo(movIds, null); h.el.parentElement.remove(); ok(null); });
    $('[data-nuevo]', h.el).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const g = await s.crearGrupo({ clase, nombre: f.nombre.value, personas: f.personas.value, precioCompra: f.precio.value }, movIds);
      h.el.parentElement.remove(); ok(g.id);
    };
  });
}

// ===================== INICIO =====================
function diasDelMes(mes) { const [a, m] = mes.split('-').map(Number); return new Date(a, m, 0).getDate(); }
function acumulado(movs, mes) {
  const d = Array(diasDelMes(mes)).fill(0);
  for (const m of movs) if (mesDe(m.fecha) === mes && (m.tipo === 'gasto' || m.tipo === 'reembolso')) d[Number(m.fecha.slice(8)) - 1] += gastoNeto(m);
  let s = 0; return d.map(v => (s += v));
}

function graficoRitmo(actual, anterior, hasta) {
  const W = 600, H = 120, n = Math.max(actual.length, anterior.length) - 1 || 1;
  const max = Math.max(1, ...actual.slice(0, hasta), ...anterior) * 1.08;
  const pts = arr => arr.map((v, i) => `${(i / n * W).toFixed(1)},${(H - v / max * H).toFixed(1)}`).join(' ');
  return `<svg class="ritmo" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gasto acumulado del mes frente al mes anterior">
    <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--borde)" vector-effect="non-scaling-stroke"/>
    ${anterior.some(v => v) ? `<polyline points="${pts(anterior)}" fill="none" stroke="var(--linea-anterior)" stroke-width="2" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : ''}
    <polyline points="${pts(actual.slice(0, hasta))}" fill="none" stroke="var(--marca)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function inicio(app, c) {
  const s = app.servicio;
  const cats = s.cats;
  const porId = catsPorId(app);
  const mes = app.filtros.mes, ant = mesAnterior(mes);
  const base = filtrar(s.movs, { ambito: app.filtros.ambito, tarjeta: app.filtros.tarjeta });
  const movsMes = base.filter(m => mesDe(m.fecha) === mes);
  const t = totales(movsMes);
  const pendientes = s.movs.filter(m => m.estado === 'pendiente').length;
  const grupos = porCategoria(movsMes, cats);
  const ingresos = ingresosPorCategoria(movsMes, cats);
  const abiertos = app._abiertos ??= new Set();

  // Ritmo de gasto frente al mes anterior
  const act = acumulado(base, mes), prev = acumulado(base, ant);
  const esMesActual = mes === mesDe(hoyIso());
  const ultimoConDatos = Math.max(0, ...movsMes.map(m => Number(m.fecha.slice(8))));
  const hasta = esMesActual ? Math.min(new Date().getDate(), act.length) : (ultimoConDatos || act.length);
  const dif = act[hasta - 1] - (prev[Math.min(hasta, prev.length) - 1] || 0);
  const hayPrev = prev.some(v => v);
  const completo = hasta >= act.length;
  const comparacion = !hayPrev ? '' : `<b>${euros(Math.abs(dif))}</b> ${dif >= 0 ? 'más' : 'menos'} que en ${MESES[Number(ant.slice(5)) - 1].toLowerCase()}${completo ? '' : ' a estas alturas'}`;

  const maxG = Math.max(1, ...grupos.map(g => g.neto));
  const filasGrupos = grupos.map(g => {
    const est = estiloGrupo(g.grupo.startsWith('Sin categoría') ? '' : g.grupo);
    const sinCat = g.grupo.startsWith('Sin categoría');
    const estilo = sinCat ? estiloCategoria(null) : est;
    let pct, color, det;
    if (g.presupuesto > 0) {
      const p = g.neto / g.presupuesto;
      pct = Math.min(100, p * 100); color = p > 1 ? 'var(--mal)' : p > 0.9 ? 'var(--aviso)' : estilo.fg;
      det = p > 1 ? `Te pasas ${euros(g.neto - g.presupuesto)} del presupuesto de ${euros(g.presupuesto)}` : `Quedan ${euros(g.presupuesto - g.neto)} de ${euros(g.presupuesto)}`;
    } else {
      pct = Math.max(0, g.neto / maxG * 100); color = estilo.fg;
      det = sinCat ? 'Pendientes de revisar' : `${t.gastos > 0 ? Math.round(g.neto / t.gastos * 100) : 0} % del gasto · ${g.cats.reduce((a, x) => a + x.n, 0)} mov.`;
    }
    return `<div>
      <button class="cat-fila" data-grupo="${esc(g.grupo)}" aria-expanded="${abiertos.has(g.grupo)}">
        ${icono(estilo)}
        <span class="cuerpo"><span class="linea"><span class="n">${esc(sinCat ? 'Sin categoría' : g.grupo)}</span><span class="v num">${euros(g.neto)}</span></span>
        <span class="pista"><i style="width:${pct}%;background:${color}"></i></span><span class="det">${esc(det)}</span></span>
      </button>
      ${abiertos.has(g.grupo) ? `<div class="subcats">${g.cats.map(ct => `<a href="#/movs?cat=${esc(ct.id)}&mes=${mes}"><span>${esc(ct.nombre)} <span class="tenue">· ${ct.n}</span></span><span class="num">${euros(ct.neto)}${ct.presupuesto ? ` <span class="tenue">/ ${euros(ct.presupuesto)}</span>` : ''}</span></a>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

  const losas = bloqueAbierto(app);

  let porTarjeta = '';
  if (app.filtros.tarjeta === 'todas') {
    const ts = tarjetasUsadas(app);
    const filas = [...agruparPor(movsMes.filter(m => m.tipo === 'gasto' || m.tipo === 'reembolso'), m => m.tarjeta || '')]
      .map(([k, l]) => ({ k, nombre: k ? s.nombreTarjeta(k) : 'Recibos, Bizum y otros', total: l.reduce((a, m) => a + gastoNeto(m), 0), n: l.length, color: k ? colorTarjeta(app, k) : null }))
      .sort((a, b) => b.total - a.total);
    if (filas.length > 1) porTarjeta = `<section class="tarjeta bloque"><div class="tarjeta-cab"><h2>Por tarjeta</h2></div>
      ${filas.map(f => `<button class="cat-fila" data-tarjeta="${esc(f.k || 'sin')}">${f.color ? `<span class="avatar" style="background:${f.color};border:0;width:40px;height:40px;border-radius:13px">${esc(inicial(f.nombre))}</span>` : icono({ icono: 'cambio', bg: 'var(--superficie-2)', fg: 'var(--texto-2)' })}
        <span class="cuerpo"><span class="linea"><span class="n">${esc(f.nombre)}</span><span class="v num">${euros(f.total)}</span></span><span class="det">${f.n} movimientos</span></span></button>`).join('')}
    </section>`;
  }

  c.innerHTML = `<div class="pagina">
    <header class="cab">${navMes(app)}<div class="acciones">${botonPersona(app)}</div></header>
    ${pestanasAmbito(app)}
    <div class="rejilla-inicio">
      <div>
        <section class="tarjeta heroe">
          <p class="etq">Gastado en ${esc(MESES[Number(mes.slice(5)) - 1].toLowerCase())}${app.filtros.tarjeta !== 'todas' ? ` · ${esc(app.filtros.tarjeta === 'sin' ? 'sin tarjeta' : s.nombreTarjeta(app.filtros.tarjeta))}` : ''}</p>
          <p class="cifra num">${euros(t.gastos)}</p>
          ${comparacion ? `<p class="comparacion">${comparacion}</p>` : ''}
          ${t.gastos || hayPrev ? graficoRitmo(act, prev, hasta) : ''}
          ${t.gastos || hayPrev ? `<div class="leyenda"><div><span><i style="background:var(--marca)"></i>${esc(MESES[Number(mes.slice(5)) - 1])}</span>${hayPrev ? `<span><i class="discontinua"></i>${esc(MESES[Number(ant.slice(5)) - 1])}</span>` : ''}</div><span>Gasto acumulado</span></div>` : ''}
          <div class="mini-datos">
            <div><p>Ingresos</p><strong class="num pos">${euros(t.ingresos)}</strong></div>
            <div><p>Recuperado</p><strong class="num">${euros(t.reembolsos)}</strong></div>
            <div><p>Balance</p><strong class="num" style="color:${t.balance >= 0 ? 'var(--ingreso)' : 'var(--texto)'}">${euros(t.balance, true)}</strong></div>
          </div>
        </section>
        ${pendientes ? `<a class="revisar-cta bloque" href="#/buzon"><span class="n">${pendientes}</span><span class="t">movimiento${pendientes > 1 ? 's' : ''} por revisar</span>${ICONOS.der}</a>` : ''}
        ${losas}
        ${porTarjeta}
      </div>
      <div>
        <section class="tarjeta">
          <div class="tarjeta-cab"><h2>Categorías</h2><a href="#/ajustes?abrir=categorias">Presupuestos</a></div>
          ${grupos.length ? filasGrupos : `<div class="vacio"><p class="suave">No hay gastos en ${esc(nombreMes(mes).toLowerCase())}${app.filtros.ambito !== 'todo' ? ' con estos filtros' : ''}.</p><a class="boton primario" href="#/importar">${ICONOS.subir} Importar extracto</a></div>`}
        </section>
        ${ingresos.length ? `<section class="tarjeta bloque"><div class="tarjeta-cab"><h2>Ingresos</h2><span class="num pos" style="font-weight:650">${euros(t.ingresos)}</span></div>
          ${ingresos.map(i => `<a class="cat-fila" href="#/movs?cat=${esc(i.id)}&mes=${mes}">${icono(estiloCategoria(porId[i.id]))}<span class="cuerpo"><span class="linea"><span class="n">${esc(i.nombre)}</span><span class="v num">${euros(i.total)}</span></span><span class="det">${i.n} movimiento${i.n > 1 ? 's' : ''}</span></span></a>`).join('')}
        </section>` : ''}
        ${t.traspasos ? `<p class="tenue" style="margin:12px 6px">Los traspasos entre tus cuentas (${euros(t.traspasos, true)}) no cuentan como ingreso ni gasto.</p>` : ''}
      </div>
    </div>
  </div>`;
  enlazarComunes(app, c);
  $$('[data-grupo]', c).forEach(b => b.onclick = () => { const g = b.dataset.grupo; abiertos.has(g) ? abiertos.delete(g) : abiertos.add(g); app.render(); });
  $$('[data-tarjeta]', c).forEach(r => r.onclick = () => { app.filtros.tarjeta = r.dataset.tarjeta; app.guardarFiltros(); app.render(); });
}

// ===================== SELECTOR DE CATEGORÍA =====================
function catsParaTipo(cats, tipo) {
  if (tipo === 'ingreso') return cats.filter(c => c.tipo === 'ingreso');
  return cats.filter(c => c.tipo !== 'ingreso');
}

function recientes(app, tipo, n = 6) {
  const porId = catsPorId(app);
  const vistos = [];
  const lista = app.servicio.movs.filter(m => m.estado === 'ok' && m.cat && porId[m.cat] && !porId[m.cat].oculta && (tipo === 'ingreso' ? porId[m.cat].tipo === 'ingreso' : porId[m.cat].tipo !== 'ingreso'))
    .sort((a, b) => (b.mod || 0) - (a.mod || 0));
  for (const m of lista) { if (!vistos.includes(m.cat)) vistos.push(m.cat); if (vistos.length >= n) break; }
  return vistos;
}

function masUsadas(app, tipo) {
  const porId = catsPorId(app);
  const cuenta = new Map();
  for (const m of app.servicio.movs) {
    if (!m.cat || m.estado !== 'ok' || !porId[m.cat] || porId[m.cat].oculta) continue;
    if ((tipo === 'ingreso') !== (porId[m.cat].tipo === 'ingreso')) continue;
    cuenta.set(m.cat, (cuenta.get(m.cat) || 0) + 1);
  }
  return [...cuenta].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export function seleccionarCategoria(app, { actual = null, tipo = 'gasto', titulo = 'Categoría' } = {}) {
  return new Promise(ok => {
    const porId = catsPorId(app);
    const lista = catsParaTipo(app.servicio.cats, tipo);
    const rec = recientes(app, tipo).filter(id => porId[id]);
    const boton = c => `<button class="cat-boton ${c.id === actual ? 'elegida' : ''}" data-cat="${esc(c.id)}" data-busca="${esc(norm(c.nombre + ' ' + c.grupo))}">${icono(estiloCategoria(c), 'pq')}<span>${esc(c.nombre)}</span></button>`;
    const grupos = agruparPor(lista, c => c.grupo);
    const h = hoja(`<h2>${esc(titulo)}</h2>
      <label class="buscador" style="margin-top:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span class="solo-lector">Buscar categoría</span><input type="search" placeholder="Buscar categoría" data-buscar></label>
      <div data-sec="rec">${rec.length ? `<p class="grupo-titulo">Recientes</p><div class="rejilla-cats">${rec.map(id => boton(porId[id])).join('')}</div>` : ''}</div>
      ${[...grupos].map(([g, cs]) => `<div data-sec="g"><p class="grupo-titulo">${esc(g)}</p><div class="rejilla-cats">${cs.map(boton).join('')}</div></div>`).join('')}
      <div class="botones"><a class="boton" href="#/ajustes?abrir=categorias" data-cerrar>${ICONOS.mas} Nueva categoría</a></div>`, { alCerrar: () => ok(null) });
    const buscar = $('[data-buscar]', h.el);
    buscar.oninput = () => {
      const q = norm(buscar.value);
      $('[data-sec=rec]', h.el).classList.toggle('oculto', !!q);
      $$('[data-sec=g]', h.el).forEach(sec => {
        let alguno = false;
        $$('[data-cat]', sec).forEach(b => { const v = !q || b.dataset.busca.includes(q); b.classList.toggle('oculto', !v); alguno ||= v; });
        sec.classList.toggle('oculto', !alguno);
      });
    };
    $$('[data-cat]', h.el).forEach(b => b.onclick = () => { const v = b.dataset.cat; h.el.parentElement.remove(); ok(v); });
  });
}

// ===================== REVISAR =====================
const rev = { id: null, cat: null, tipo: null, ambito: null, grupo: null, recordar: true, saltados: new Set() };

function tiposPosibles(m) { return m.importe < 0 ? ['gasto', 'traspaso'] : ['ingreso', 'reembolso', 'traspaso']; }

function opcionesRapidas(app, m, tipo) {
  const porId = catsPorId(app);
  const kind = tipo === 'ingreso' ? 'ingreso' : 'gasto';
  const ids = [];
  if (m.cat && porId[m.cat] && (porId[m.cat].tipo === 'ingreso') === (kind === 'ingreso')) ids.push(m.cat);
  if (rev.cat && !ids.includes(rev.cat) && porId[rev.cat]) ids.push(rev.cat);
  for (const id of [...recientes(app, kind, 4), ...masUsadas(app, kind)]) { if (!ids.includes(id)) ids.push(id); if (ids.length >= 6) break; }
  if (ids.length < 6) for (const c of catsParaTipo(app.servicio.cats, kind)) { if (!ids.includes(c.id)) ids.push(c.id); if (ids.length >= 6) break; }
  return ids.slice(0, 6).map(id => porId[id]);
}

function vistaRevisar(app, c) {
  const s = app.servicio;
  const aj = s.ajustes;
  const al = alias(app);
  const pend = s.movs.filter(m => m.estado === 'pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha) || Math.abs(b.importe) - Math.abs(a.importe));
  const conSug = pend.filter(m => m.cat || m.tipo === 'traspaso');
  const sinSug = pend.filter(m => !m.cat && m.tipo !== 'traspaso');
  const iaLista = aj.iaActiva && aj.apiKey;
  const total = pend.length + s.movs.filter(m => m.estado === 'ok' && m.revisadoEn && Date.now() - m.revisadoEn < 3600000).length;

  if (!pend.length) {
    rev.id = null;
    c.innerHTML = `<div class="pagina estrecha"><header class="cab"><h1>Revisar</h1></header>
      <section class="tarjeta vacio"><span class="ic gr" style="background:var(--marca-suave);color:var(--marca);margin:0 auto">${ICONOS.check}</span>
        <h2>Todo revisado</h2><p class="suave">Cuando importes un extracto, lo que la app no sepa clasificar aparecerá aquí.</p>
        <a class="boton primario" href="#/importar">${ICONOS.subir} Importar extracto</a></section></div>`;
    return;
  }
  let m = pend.find(x => x.id === rev.id);
  if (!m) {
    m = pend.find(x => !rev.saltados.has(x.id)) || pend[0];
    if (!pend.some(x => !rev.saltados.has(x.id))) rev.saltados.clear();
    Object.assign(rev, { id: m.id, cat: m.cat, tipo: m.tipo, ambito: m.ambito || 'familia', grupo: m.grupo || m.grupoSugerido || null, recordar: true });
  }
  const posicion = pend.indexOf(m) + 1;
  const porId = catsPorId(app);
  const tipos = tiposPosibles(m);
  if (!tipos.includes(rev.tipo)) rev.tipo = tipos[0];
  const opciones = rev.tipo === 'traspaso' ? [] : opcionesRapidas(app, m, rev.tipo);
  const catSel = porId[rev.cat];
  const clave = claveAprendizaje(m);
  const tarjeta = m.tarjeta ? s.nombreTarjeta(m.tarjeta) : null;
  const est = estiloMovimiento({ ...m, tipo: rev.tipo }, catSel);
  const etiquetaConfirmar = rev.tipo === 'traspaso' ? 'Es un traspaso' : catSel ? esc(catSel.nombre) : 'Elige categoría';
  const msg = detalleOriginal(m);

  c.innerHTML = `<div class="pagina">
    <header class="cab"><h1>Revisar</h1><div class="acciones">
      ${conSug.length ? `<button class="boton mini" data-acc="todos">${ICONOS.check} Aceptar ${conSug.length} sugerencia${conSug.length > 1 ? 's' : ''}</button>` : ''}
      ${sinSug.length && iaLista ? `<button class="boton mini" data-acc="ia">Sugerir con IA (${sinSug.length})</button>` : ''}
    </div></header>
    ${sinSug.length && !iaLista ? `<p class="tenue" style="margin:0 4px 8px">Hay ${sinSug.length} sin sugerencia. <a href="#/ajustes?abrir=ia">Activa la IA</a> para que te proponga categoría.</p>` : ''}
    <div class="revisar">
      <nav class="cola" aria-label="Pendientes">${pend.slice(0, 200).map(x => `<button data-ir="${esc(x.id)}" class="${x.id === m.id ? 'actual' : ''}">${icono(estiloMovimiento(x, porId[x.cat]), 'pq')}<span class="n">${esc(nombreBonito(x, al))}</span><span class="v num">${euros(x.importe, true)}</span></button>`).join('')}</nav>
      <div style="max-width:620px;width:100%;margin:0 auto">
        <div class="fila" style="margin:0 4px 6px;font-size:13px;color:var(--texto-2)"><span>${posicion} de ${pend.length}</span><span style="text-align:right">${conSug.length} con sugerencia</span></div>
        <div class="progreso"><i style="width:${Math.round((total - pend.length) / Math.max(total, 1) * 100)}%"></i></div>
        <section class="ficha" style="margin-top:14px">
          ${icono(est, 'gr')}
          <h2>${esc(nombreBonito(m, al))}</h2>
          <p class="orig">${esc(m.desc)}${tarjeta ? ` · ${esc(tarjeta)}` : ''}</p>
          <p class="cifra num" style="color:${m.importe > 0 ? 'var(--ingreso)' : 'var(--texto)'}">${euros(m.importe, true)}</p>
          <p class="cuando">${esc(fechaLarga(m.fecha))}</p>
          ${msg ? `<p class="msg">${esc(msg)}</p>` : ''}
          ${m.origen === 'ia' && m.cat ? '<p style="margin:10px 0 0"><span class="etiqueta ia">Sugerido por la IA</span></p>' : m.motivo && m.cat ? `<p style="margin:10px 0 0"><span class="etiqueta">${esc(m.motivo)}</span></p>` : ''}
        </section>
        ${rev.tipo !== 'traspaso' ? `
        <div class="tarjeta-cab" style="margin:18px 4px 0"><h2 class="titulo-sec" style="font-size:15px">¿En qué categoría va?</h2><button class="enlace" data-acc="todas">Ver todas</button></div>
        <div class="opciones">${opciones.map((o, i) => `<button class="opcion ${o.id === rev.cat ? 'elegida' : ''}" data-op="${esc(o.id)}">${icono(estiloCategoria(o), 'pq')}<span class="t">${esc(o.nombre)}</span><span class="tecla">${i + 1}</span></button>`).join('')}</div>` : ''}
        <div class="ajustes-rev">
          <div><span>Tipo</span><div class="segmentado" role="group" aria-label="Tipo">${tipos.map(tp => `<button data-tipo="${tp}" class="${rev.tipo === tp ? 'activo' : ''}">${TIPOS[tp]}</button>`).join('')}</div></div>
          <div><span>Ámbito</span><div class="segmentado" role="group" aria-label="Ámbito">${Object.entries(AMBITOS).map(([k, v]) => `<button data-amb="${k}" class="${rev.ambito === k ? 'activo' : ''}">${v}</button>`).join('')}</div></div>
          ${rev.tipo !== 'traspaso' ? `<div><span>Grupo</span><button class="boton mini" data-acc="grupo" style="max-width:62%;overflow:hidden;text-overflow:ellipsis">${(() => { const g = s.repo.obtener('grupo', rev.grupo); return g ? `${g.id === m.grupoSugerido ? 'Sugerido: ' : ''}${esc(g.nombre)}` : 'Ninguno'; })()}</button></div>` : ''}
          ${clave && rev.tipo !== 'traspaso' ? `<label><span>Recordar para «${esc(clave)}» en adelante</span><input type="checkbox" data-recordar ${rev.recordar ? 'checked' : ''}></label>` : ''}
        </div>
        <div class="acciones-rev">
          <button class="boton grande" data-acc="saltar">Saltar</button>
          <button class="boton primario grande" data-acc="ok" ${!catSel && rev.tipo !== 'traspaso' ? 'disabled' : ''}>${ICONOS.check} ${etiquetaConfirmar}</button>
        </div>
        <p class="atajos"><kbd>1</kbd>–<kbd>6</kbd> elegir · <kbd>Intro</kbd> confirmar · <kbd>S</kbd> saltar</p>
      </div>
    </div>
  </div>`;

  $$('[data-op]', c).forEach(b => b.onclick = () => { rev.cat = b.dataset.op; ajustarAmbito(rev); app.render(); });
  $$('[data-tipo]', c).forEach(b => b.onclick = () => {
    const antes = rev.tipo; rev.tipo = b.dataset.tipo;
    if ((antes === 'ingreso') !== (rev.tipo === 'ingreso')) rev.cat = null;
    app.render();
  });
  $$('[data-amb]', c).forEach(b => b.onclick = () => { rev.ambito = b.dataset.amb; app.render(); });
  c.querySelector('[data-recordar]')?.addEventListener('change', e => { rev.recordar = e.target.checked; });
  $$('[data-ir]', c).forEach(b => b.onclick = () => { rev.id = null; const x = s.repo.obtener('mov', b.dataset.ir); Object.assign(rev, { id: x.id, cat: x.cat, tipo: x.tipo, ambito: x.ambito || 'familia', grupo: x.grupo || x.grupoSugerido || null, recordar: true }); app.render(); });
  c.querySelector('[data-acc=todas]')?.addEventListener('click', async () => {
    const id = await seleccionarCategoria(app, { actual: rev.cat, tipo: rev.tipo });
    if (id) { rev.cat = id; ajustarAmbito(rev); app.render(); }
  });
  c.querySelector('[data-acc=grupo]')?.addEventListener('click', async () => {
    const r = await elegirGrupo(app, { actual: rev.grupo, clasePreferida: rev.ambito === 'wallapop' ? 'articulo' : 'evento', movIds: [] });
    if (r !== undefined) { rev.grupo = r; app.render(); }
  });
  c.querySelector('[data-acc=saltar]').onclick = () => saltar(app);
  c.querySelector('[data-acc=ok]').onclick = () => confirmarActual(app);
  c.querySelector('[data-acc=todos]')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    const r = await s.confirmar(conSug.map(x => x.id));
    const n = await s.reclasificarPendientes();
    aviso(`${r.movs} confirmados${r.reglas ? ` · ${r.reglas} reglas aprendidas` : ''}${n ? ` · ${n} reclasificados` : ''}`);
  });
  c.querySelector('[data-acc=ia]')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Preguntando a la IA…';
    try {
      const r = await s.clasificarPendientesConIA((h, t) => { b.textContent = `IA… ${h}/${t}`; });
      aviso(`La IA ha sugerido categoría para ${r.n} de ${r.total}. Revísalas y confirma.`);
      rev.id = null;
    } catch (err) { aviso(err.message, { error: true, ms: 6000 }); b.disabled = false; b.textContent = 'Reintentar con IA'; }
  });
}

function ajustarAmbito(r) {
  const amb = { 'eur-gastos': 'euroimmun', 'ing-euroimmun': 'euroimmun', 'wal-compras': 'wallapop', 'ing-wallapop': 'wallapop' }[r.cat];
  if (amb) r.ambito = amb;
}

function saltar(app) { if (rev.id) rev.saltados.add(rev.id); rev.id = null; app.render(); }

async function confirmarActual(app) {
  const s = app.servicio;
  const m = s.repo.obtener('mov', rev.id);
  if (!m) return;
  if (!rev.cat && rev.tipo !== 'traspaso') return aviso('Elige una categoría', { error: true });
  const clave = claveAprendizaje(m);
  const recordar = rev.recordar && rev.tipo !== 'traspaso';
  rev.id = null;
  await s.confirmar(m.id, { tipo: rev.tipo, cat: rev.tipo === 'traspaso' ? null : rev.cat, ambito: rev.ambito, grupo: rev.tipo === 'traspaso' ? null : rev.grupo, revisadoEn: Date.now() }, { aprenderRegla: recordar });
  const n = recordar ? await s.reclasificarPendientes() : 0;
  if (n) aviso(`Aprendido «${clave}» · aplicado a ${n} más`);
}

// Atajos de teclado en Revisar (ordenador)
document.addEventListener('keydown', e => {
  if (!location.hash.startsWith('#/buzon') || document.querySelector('.velo')) return;
  if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const a = window.__app;
  if (!a?.repo?.clave) return;
  if (/^[1-6]$/.test(e.key)) { const b = $$('.opcion')[Number(e.key) - 1]; if (b) { e.preventDefault(); b.click(); } }
  else if (e.key === 'Enter') { const b = $('[data-acc=ok]'); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
  else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowRight') { e.preventDefault(); saltar(a); }
});

// ===================== MOVIMIENTOS =====================
const fm = { texto: '', periodo: 'mes', cat: '', tipo: '', limite: 200 };
function vistaMovs(app, c, params) {
  const s = app.servicio;
  const al = alias(app);
  if (params.get('ambito')) { app.filtros.ambito = params.get('ambito'); fm.periodo = 'todo'; history.replaceState(null, '', '#/movs'); }
  if (params.has('cat')) { fm.cat = params.get('cat'); fm.periodo = 'mes'; if (params.get('mes')) app.filtros.mes = params.get('mes'); history.replaceState(null, '', '#/movs'); }
  const base = filtrar(s.movs, { ...app.filtros, mes: fm.periodo === 'mes' ? app.filtros.mes : null });
  const q = norm(fm.texto);
  const porId = catsPorId(app);
  const lista = base.filter(m =>
    (!fm.cat || m.cat === fm.cat || (fm.cat === '_sin' && !m.cat && m.tipo !== 'traspaso')) &&
    (!fm.tipo || m.tipo === fm.tipo) &&
    (!q || norm(m.desc).includes(q) || norm(nombreBonito(m, al)).includes(q) || norm(m.nota).includes(q) || String(Math.abs(m.importe)).replace('.', ',').includes(q.replace('.', ','))))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
  const t = totales(lista);
  const dias = agruparPor(lista.slice(0, fm.limite), m => m.fecha);
  const ts = tarjetasUsadas(app);
  c.innerHTML = `<div class="pagina estrecha">
    <header class="cab"><h1>Movimientos</h1><div class="acciones"><button class="boton mini" data-acc="nuevo">${ICONOS.mas} Añadir</button></div></header>
    <label class="buscador"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span class="solo-lector">Buscar</span>
      <input type="search" id="buscar" placeholder="Buscar comercio, nota o importe" value="${esc(fm.texto)}" autocomplete="off"></label>
    <div class="chips" style="margin-top:10px">
      <select class="chip-select activo" id="f-periodo" aria-label="Periodo"><option value="mes" ${fm.periodo === 'mes' ? 'selected' : ''}>Un mes</option><option value="todo" ${fm.periodo === 'todo' ? 'selected' : ''}>Todo el historial</option></select>
      <select class="chip-select ${app.filtros.ambito !== 'todo' ? 'activo' : ''}" id="f-ambito" aria-label="Ámbito">${Object.entries(AMBITOS_FILTRO).map(([k, v]) => `<option value="${k}" ${app.filtros.ambito === k ? 'selected' : ''}>${k === 'todo' ? 'Todos los ámbitos' : v}</option>`).join('')}</select>
      ${ts.length ? `<select class="chip-select ${app.filtros.tarjeta !== 'todas' ? 'activo' : ''}" id="f-tarjeta" aria-label="Tarjeta"><option value="todas">Todas las tarjetas</option>${ts.map(x => `<option value="${esc(x.id.slice(2))}" ${app.filtros.tarjeta === x.id.slice(2) ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}<option value="sin" ${app.filtros.tarjeta === 'sin' ? 'selected' : ''}>Sin tarjeta</option></select>` : ''}
      <select class="chip-select ${fm.cat ? 'activo' : ''}" id="f-cat" aria-label="Categoría"><option value="">Categoría</option>${[...agruparPor(s.cats, x => x.grupo)].map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(x => `<option value="${esc(x.id)}" ${fm.cat === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</optgroup>`).join('')}<option value="_sin" ${fm.cat === '_sin' ? 'selected' : ''}>Sin categoría</option></select>
      <select class="chip-select ${fm.tipo ? 'activo' : ''}" id="f-tipo" aria-label="Tipo"><option value="">Tipo</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${fm.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div>
    ${fm.periodo === 'mes' ? `<div style="margin-top:4px">${navMes(app, nombreMes(app.filtros.mes)).replace('<h1>', '<h1 style="font-size:17px">')}</div>` : ''}
    <p class="resumen-filtro">${lista.length} movimientos · gastos ${euros(t.gastos)} · ingresos ${euros(t.ingresos)}</p>
    ${lista.length ? [...dias].map(([d, ms]) => {
      const neto = ms.filter(x => x.tipo !== 'traspaso').reduce((a, x) => a + x.importe, 0);
      return `<div class="dia-cab"><span>${esc(fechaLarga(d))}</span><span class="num">${euros(neto, true)}</span></div><ul class="lista">${ms.map(m => filaMov(app, m, porId, al)).join('')}</ul>`;
    }).join('') : '<section class="tarjeta vacio" style="margin-top:12px"><p class="suave">Nada con estos filtros.</p></section>'}
    ${lista.length > fm.limite ? `<div class="botones" style="justify-content:center"><button class="boton" data-acc="mas">Ver más</button></div>` : ''}
  </div>`;
  enlazarComunes(app, c);
  const b = $('#buscar', c);
  let tb; b.oninput = () => { clearTimeout(tb); tb = setTimeout(() => { fm.texto = b.value; app.render(); }, 200); };
  $('#f-periodo', c).onchange = e => { fm.periodo = e.target.value; app.render(); };
  $('#f-ambito', c).onchange = e => { app.filtros.ambito = e.target.value; app.guardarFiltros(); app.render(); };
  c.querySelector('#f-tarjeta')?.addEventListener('change', e => { app.filtros.tarjeta = e.target.value; app.guardarFiltros(); app.render(); });
  $('#f-cat', c).onchange = e => { fm.cat = e.target.value; app.render(); };
  $('#f-tipo', c).onchange = e => { fm.tipo = e.target.value; app.render(); };
  c.querySelector('[data-acc=mas]')?.addEventListener('click', () => { fm.limite += 200; app.render(); });
  c.querySelector('[data-acc=nuevo]').onclick = () => nuevoMovimiento(app);
  $$('.mov', c).forEach(li => { li.onclick = () => editarMovimiento(app, li.dataset.id); li.onkeydown = e => { if (e.key === 'Enter') editarMovimiento(app, li.dataset.id); }; });
}

function filaMov(app, m, porId, al) {
  const cat = porId[m.cat];
  const tarjeta = m.tarjeta ? app.servicio.nombreTarjeta(m.tarjeta) : null;
  const grupo = m.grupo ? app.servicio.repo.obtener('grupo', m.grupo) : null;
  const sub = [m.tipo === 'traspaso' ? 'Traspaso' : cat ? cat.nombre : 'Sin categoría', grupo ? `● ${grupo.nombre}` : null, tarjeta, m.nota ? `«${m.nota}»` : detalleOriginal(m)].filter(Boolean).join(' · ');
  let etiqueta = '';
  if (m.estado === 'pendiente') etiqueta = '<span class="etiqueta naranja">Por revisar</span>';
  else if (m.tipo === 'reembolso') etiqueta = '<span class="etiqueta azul">Te devuelven</span>';
  else if (m.ambito && m.ambito !== 'familia') etiqueta = `<span class="etiqueta">${esc(AMBITOS[m.ambito])}</span>`;
  return `<li class="mov" data-id="${esc(m.id)}" tabindex="0" role="button">
    ${icono(estiloMovimiento(m, cat))}
    <div class="cuerpo"><div class="nombre">${esc(nombreBonito(m, al))}</div><div class="sub">${esc(sub)}</div></div>
    <div class="imp"><b class="num" style="color:${m.importe > 0 && m.tipo !== 'traspaso' ? 'var(--ingreso)' : 'var(--texto)'}">${euros(m.importe, true)}</b>${etiqueta}</div>
  </li>`;
}

export function editarMovimiento(app, id) {
  const s = app.servicio;
  const m = s.repo.obtener('mov', id);
  if (!m) return;
  const al = alias(app);
  const porId = catsPorId(app);
  const tarjeta = m.tarjeta ? s.nombreTarjeta(m.tarjeta) : null;
  const clave = claveAprendizaje(m);
  const estado = { tipo: m.tipo, cat: m.cat, ambito: m.ambito || 'familia' };
  const tipos = tiposPosibles(m);
  const h = hoja(`<div style="display:flex;gap:14px;align-items:center;margin-top:4px">${icono(estiloMovimiento(m, porId[m.cat]), 'gr')}
      <div style="min-width:0"><h2 style="margin:0">${esc(nombreBonito(m, al))}</h2><p class="tenue" style="margin:2px 0 0;word-break:break-word">${esc(m.desc)}</p></div></div>
    <p class="num" style="font-size:30px;font-weight:650;margin:14px 0 0;color:${m.importe > 0 ? 'var(--ingreso)' : 'var(--texto)'}">${euros(m.importe, true)}</p>
    <p class="suave" style="margin:2px 0 0">${esc(fechaLarga(m.fecha))}${tarjeta ? ' · ' + esc(tarjeta) : ''}${m.saldo != null ? ' · saldo ' + euros(m.saldo) : ''}</p>
    <form>
      <div class="campo"><span>Categoría</span><button type="button" class="boton-cat" data-cat></button></div>
      <div class="campo"><span>Tipo</span><div class="segmentado" data-seg="tipo">${tipos.map(tp => `<button type="button" data-v="${tp}">${TIPOS[tp]}</button>`).join('')}</div></div>
      <div class="campo"><span>Ámbito</span><div class="segmentado" data-seg="ambito">${Object.entries(AMBITOS).map(([k, v]) => `<button type="button" data-v="${k}">${v}</button>`).join('')}</div></div>
      <div class="campo"><span>Grupo</span><button type="button" class="boton-cat" data-grupo-btn>${(() => { const g = s.repo.obtener('grupo', m.grupo); return g ? `${icono(g.clase === 'evento' ? ESTILO_EVENTO : ESTILO_ARTICULO, 'pq')}<span class="t">${esc(g.nombre)}</span>` : `${icono({ icono: 'regalo', bg: 'var(--superficie-2)', fg: 'var(--texto-2)' }, 'pq')}<span class="t">Añadir a un evento o artículo de Wallapop</span>`; })()}${ICONOS.der}</button></div>
      ${esGastoTrabajo(m) || esReembolsoTrabajo(m) ? `<label class="campo"><span>Nota de gastos de Euroimmun</span><select name="notaMes">${[-2, -1, 0, 1, 2].map(d => { const mm = mesAnterior(mesNota(m), -d); return `<option value="${mm}" ${mm === mesNota(m) ? 'selected' : ''}>${esc(nombreMes(mm))}</option>`; }).join('')}</select></label>` : ''}
      <label class="campo"><span>Nombre</span><input type="text" name="nombre" value="${esc(nombreBonito(m, al))}"></label>
      <label class="interruptor"><span>Usar este nombre para todos los de «${esc(clave || '')}»</span><input type="checkbox" name="alias"></label>
      <label class="campo"><span>Nota</span><input type="text" name="nota" value="${esc(m.nota || '')}" placeholder="Opcional"></label>
      ${clave ? `<label class="interruptor"><span>Recordar la categoría para «${esc(clave)}»</span><input type="checkbox" name="aprender" ${m.estado === 'pendiente' ? 'checked' : ''}></label>` : ''}
      <div class="botones">
        <button class="boton primario grande" type="submit" style="flex:1">${m.estado === 'pendiente' ? 'Confirmar' : 'Guardar'}</button>
        <button class="boton peligro grande" type="button" data-borrar>Borrar</button>
      </div>
      <div class="botones">${m.padre ? `<span class="tenue" style="align-self:center">Es una parte de un movimiento dividido.</span><button type="button" class="boton mini" data-deshacer>Deshacer división</button>` : `<button type="button" class="boton mini" data-dividir>Dividir en partes</button>`}</div>
    </form>`);
  const f = $('form', h.el);
  const pintar = () => {
    const cat = porId[estado.cat];
    $('[data-cat]', h.el).innerHTML = estado.tipo === 'traspaso' ? `${icono(estiloMovimiento({ tipo: 'traspaso' }), 'pq')}<span class="t">No aplica a traspasos</span>` : `${icono(estiloCategoria(cat), 'pq')}<span class="t">${esc(cat ? `${cat.grupo} › ${cat.nombre}` : 'Elegir categoría')}</span>${ICONOS.der}`;
    $('[data-cat]', h.el).disabled = estado.tipo === 'traspaso';
    $$('[data-seg=tipo] button', h.el).forEach(b => b.classList.toggle('activo', b.dataset.v === estado.tipo));
    $$('[data-seg=ambito] button', h.el).forEach(b => b.classList.toggle('activo', b.dataset.v === estado.ambito));
  };
  pintar();
  $('[data-cat]', h.el).onclick = async () => {
    const v = await seleccionarCategoria(app, { actual: estado.cat, tipo: estado.tipo });
    if (v) { estado.cat = v; ajustarAmbito(estado); pintar(); }
  };
  $$('[data-seg=tipo] button', h.el).forEach(b => b.onclick = () => { const antes = estado.tipo; estado.tipo = b.dataset.v; if ((antes === 'ingreso') !== (estado.tipo === 'ingreso')) estado.cat = null; pintar(); });
  $$('[data-seg=ambito] button', h.el).forEach(b => b.onclick = () => { estado.ambito = b.dataset.v; pintar(); });
  $('[data-grupo-btn]', h.el).onclick = async () => {
    const r = await elegirGrupo(app, { actual: m.grupo, clasePreferida: m.ambito === 'wallapop' ? 'articulo' : 'evento', movIds: [id] });
    if (r !== undefined) { h.cerrar(); editarMovimiento(app, id); }
  };
  f.notaMes?.addEventListener('change', () => s.asignarNota(id, f.notaMes.value));
  h.el.querySelector('[data-dividir]')?.addEventListener('click', () => dividirMovimiento(app, m));
  h.el.querySelector('[data-deshacer]')?.addEventListener('click', async () => {
    if (await confirmar('Se borrarán las partes y volverá el movimiento original.', { si: 'Deshacer' })) { await s.deshacerDivision(m.padre); h.cerrar(); }
  });
  f.onsubmit = async e => {
    e.preventDefault();
    const nombre = f.nombre.value.trim();
    const cambios = { tipo: estado.tipo, cat: estado.tipo === 'traspaso' ? null : estado.cat, ambito: estado.ambito, nota: f.nota.value.trim() };
    if (f.alias.checked && nombre) {
      const { comercio } = await import('./core/clasificador.js');
      await s.guardarAjustes({ alias: { ...al, [comercio(m)]: nombre } });
    } else if (nombre && nombre !== nombreBonito({ ...m, nombre: '' }, al)) cambios.nombre = nombre;
    const aprender = f.aprender?.checked;
    if (m.estado === 'pendiente' || aprender) {
      if (!cambios.cat && cambios.tipo !== 'traspaso') return aviso('Elige una categoría', { error: true });
      await s.confirmar(id, cambios, { aprenderRegla: !!aprender });
      const n = await s.reclasificarPendientes();
      if (n) aviso(`Aplicado también a ${n} pendientes`);
    } else await s.editarMov(id, cambios);
    h.cerrar();
  };
  $('[data-borrar]', h.el).onclick = async () => {
    if (await confirmar('¿Borrar este movimiento? Si vuelves a importar el mismo extracto, volverá a aparecer.', { si: 'Borrar', peligro: true })) {
      await s.repo.borrar('mov', id); h.cerrar();
    }
  };
}

function nuevoMovimiento(app) {
  const s = app.servicio;
  const estado = { tipo: 'gasto', cat: null };
  const h = hoja(`<h2>Añadir movimiento</h2><p class="suave" style="margin:0">Para gastos en efectivo o cosas que no salen en el banco.</p>
    <form>
      <div class="campo"><span>Tipo</span><div class="segmentado" data-seg>${['gasto', 'ingreso'].map(tp => `<button type="button" data-v="${tp}">${TIPOS[tp]}</button>`).join('')}</div></div>
      <div class="fila"><label class="campo"><span>Importe (€)</span><input type="number" name="importe" step="0.01" min="0.01" required inputmode="decimal"></label>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${hoyIso()}" required></label></div>
      <label class="campo"><span>Concepto</span><input type="text" name="desc" value="Efectivo" required></label>
      <div class="campo"><span>Categoría</span><button type="button" class="boton-cat" data-cat></button></div>
      <div class="botones"><button class="boton primario grande" style="flex:1">Guardar</button></div>
    </form>`);
  const f = $('form', h.el);
  const porId = catsPorId(app);
  const pintar = () => {
    const cat = porId[estado.cat];
    $('[data-cat]', h.el).innerHTML = `${icono(estiloCategoria(cat), 'pq')}<span class="t">${esc(cat ? `${cat.grupo} › ${cat.nombre}` : 'Elegir categoría')}</span>${ICONOS.der}`;
    $$('[data-seg] button', h.el).forEach(b => b.classList.toggle('activo', b.dataset.v === estado.tipo));
  };
  pintar();
  $$('[data-seg] button', h.el).forEach(b => b.onclick = () => { estado.tipo = b.dataset.v; estado.cat = null; pintar(); });
  $('[data-cat]', h.el).onclick = async () => { const v = await seleccionarCategoria(app, { actual: estado.cat, tipo: estado.tipo }); if (v) { estado.cat = v; pintar(); } };
  f.onsubmit = async e => {
    e.preventDefault();
    if (!estado.cat) return aviso('Elige una categoría', { error: true });
    const amb = { 'eur-gastos': 'euroimmun', 'ing-euroimmun': 'euroimmun', 'wal-compras': 'wallapop', 'ing-wallapop': 'wallapop' }[estado.cat] || 'familia';
    await s.crearMovManual({ fecha: f.fecha.value, desc: f.desc.value.trim(), importe: f.importe.value, tipo: estado.tipo, cat: estado.cat, ambito: amb });
    aviso('Guardado'); h.cerrar();
  };
}

// ===================== EVOLUCIÓN =====================
function vistaEvolucion(app, c) {
  const s = app.servicio;
  const movs = filtrar(s.movs, { ambito: app.filtros.ambito, tarjeta: app.filtros.tarjeta });
  const ev = evolucion(movs, app.filtros.mes, 12, s.catsTodas);
  const primero = ev.findIndex(x => !x.vacio);
  const serie = primero >= 0 ? ev.slice(primero) : [];
  const medias = mediasPorCategoria(movs, app.filtros.mes, 6);
  const porGrupo = {};
  for (const [id, v] of Object.entries(medias)) {
    const cat = s.repo.obtener('cat', id); if (!cat) continue;
    porGrupo[cat.grupo] ??= { media: 0, pres: 0 };
    porGrupo[cat.grupo].media += v;
  }
  for (const cat of s.cats) if (cat.presupuesto && porGrupo[cat.grupo]) porGrupo[cat.grupo].pres += cat.presupuesto;
  const gruposOrden = Object.entries(porGrupo).sort((a, b) => b[1].media - a[1].media);
  const conDatos = serie.filter(x => !x.vacio);
  const mediaGasto = conDatos.length ? conDatos.reduce((a, x) => a + x.gastos, 0) / conDatos.length : 0;
  const mediaIng = conDatos.length ? conDatos.reduce((a, x) => a + x.ingresos, 0) / conDatos.length : 0;
  c.innerHTML = `<div class="pagina">
    <header class="cab">${navMes(app, 'Evolución')}<div class="acciones">${botonPersona(app)}</div></header>
    ${pestanasAmbito(app)}
    ${serie.length ? `<div class="rejilla-inicio">
      <div>
        <section class="tarjeta"><div class="tarjeta-cab"><h2>Ingresos y gastos</h2><span class="tenue">hasta ${esc(nombreMes(app.filtros.mes).toLowerCase())}</span></div>
          <div class="leyenda" style="margin:0 0 8px"><div><span><i style="background:var(--ingreso);height:10px;width:10px;border-radius:3px"></i>Ingresos</span><span><i style="background:var(--gasto);height:10px;width:10px;border-radius:3px"></i>Gastos</span></div></div>
          ${graficoMeses(serie)}
          <div class="mini-datos"><div><p>Ingreso medio</p><strong class="num pos">${euros(mediaIng)}</strong></div><div><p>Gasto medio</p><strong class="num">${euros(mediaGasto)}</strong></div><div><p>Ahorro medio</p><strong class="num">${euros(mediaIng - mediaGasto, true)}</strong></div></div>
        </section>
        <section class="tarjeta bloque"><div class="tarjeta-cab"><h2>Mes a mes</h2></div><div class="desplazable">
          <table class="tabla"><thead><tr><th>Mes</th><th class="der">Ingresos</th><th class="der">Gastos</th><th class="der">Balance</th></tr></thead>
          <tbody>${serie.slice().reverse().map(x => `<tr><td>${esc(nombreMes(x.mes))}</td><td class="der num">${x.vacio ? '—' : euros(x.ingresos)}</td><td class="der num">${x.vacio ? '—' : euros(x.gastos)}</td><td class="der num" style="color:${x.balance >= 0 ? 'var(--ingreso)' : 'inherit'}">${x.vacio ? '—' : euros(x.balance, true)}</td></tr>`).join('')}</tbody></table></div>
        </section>
      </div>
      <section class="tarjeta"><div class="tarjeta-cab"><h2>Gasto medio al mes</h2><span class="tenue">últimos 6 meses</span></div>
        ${gruposOrden.map(([g, v]) => { const e = estiloGrupo(g); const p = v.pres ? Math.min(100, v.media / v.pres * 100) : 0; return `<div class="cat-fila">${icono(e)}<span class="cuerpo"><span class="linea"><span class="n">${esc(g)}</span><span class="v num">${euros(v.media)}</span></span>${v.pres ? `<span class="pista"><i style="width:${p}%;background:${v.media > v.pres ? 'var(--mal)' : e.fg}"></i></span><span class="det">Presupuesto ${euros(v.pres)}</span>` : '<span class="det">Sin presupuesto</span>'}</span></div>`; }).join('')}
        <div class="botones"><a class="boton mini" href="#/ajustes?abrir=categorias">Ajustar presupuestos</a></div>
      </section>
    </div>` : '<section class="tarjeta vacio" style="margin-top:12px"><p class="suave">Aún no hay datos para este periodo.</p></section>'}
  </div>`;
  enlazarComunes(app, c);
  activarTooltips(c);
}

function graficoMeses(serie) {
  const W = Math.round(Math.max(300, Math.min(640, (innerWidth >= 1000 ? (innerWidth - 248 - 80) * 0.52 : innerWidth - 72)))), H = 220, mi = 44, md = 6, ms = 10, mb = 26;
  const maxV = Math.max(1, ...serie.map(x => Math.max(x.ingresos, x.gastos)));
  const paso = niceStep(maxV / 4);
  const top = Math.ceil(maxV / paso) * paso;
  const y = v => ms + (H - ms - mb) * (1 - v / top);
  const anchoGrupo = (W - mi - md) / serie.length;
  const bw = Math.min(20, (anchoGrupo - 10) / 2);
  const columna = (x, v, color) => {
    const h = Math.max(0, y(0) - y(v)); if (h < 0.5) return '';
    const r = Math.min(4, h, bw / 2), yt = y(v);
    return `<path d="M${x},${y(0)} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${y(0)} Z" fill="${color}"/>`;
  };
  let g = '';
  for (let v = 0; v <= top + 0.01; v += paso) {
    g += `<line class="eje" x1="${mi}" x2="${W - md}" y1="${y(v)}" y2="${y(v)}" stroke-dasharray="${v ? '2 3' : ''}"/>`;
    g += `<text x="${mi - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? (v / 1000).toLocaleString('es-ES') + ' k' : v}</text>`;
  }
  const abrev = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  serie.forEach((x, i) => {
    const cx = mi + i * anchoGrupo + anchoGrupo / 2;
    g += columna(cx - bw - 1, x.ingresos, 'var(--ingreso)') + columna(cx + 1, x.gastos, 'var(--gasto)');
    const [a, m] = x.mes.split('-');
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${abrev[m - 1]}${m === '01' || i === 0 ? " '" + a.slice(2) : ''}</text>`;
    g += `<rect x="${mi + i * anchoGrupo}" y="${ms}" width="${anchoGrupo}" height="${H - ms - mb}" fill="transparent" data-tip="${esc(nombreMes(x.mes))}|Ingresos ${esc(euros(x.ingresos))}|Gastos ${esc(euros(x.gastos))}|Balance ${esc(euros(x.balance, true))}"/>`;
  });
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por mes">${g}</svg>`;
}

function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function activarTooltips(c) {
  let tip;
  const quitar = () => { tip?.remove(); tip = null; };
  $$('[data-tip]', c).forEach(el => {
    const mostrar = e => {
      quitar();
      tip = document.createElement('div'); tip.className = 'tooltip';
      const [t, ...l] = el.dataset.tip.split('|');
      tip.innerHTML = `<strong>${esc(t)}</strong><br>${l.map(esc).join('<br>')}`;
      document.body.append(tip);
      const w = tip.offsetWidth;
      tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, e.clientX - w / 2)) + 'px';
      tip.style.top = (e.clientY - tip.offsetHeight - 14) + 'px';
      el.setAttribute('fill', 'color-mix(in srgb, var(--texto) 6%, transparent)');
    };
    el.addEventListener('pointermove', mostrar);
    el.addEventListener('pointerleave', () => { quitar(); el.setAttribute('fill', 'transparent'); });
  });
}

// ===================== IMPORTAR =====================
let analisisActual = null;
let resultadoHtml = '';
const tipoArchivo = { modo: 'cuenta', tarjeta: '0084' };
function vistaImportar(app, c) {
  const s = app.servicio;
  const imps = s.repo.lista('imp').sort((a, b) => b.fecha - a.fecha).slice(0, 8);
  c.innerHTML = `<div class="pagina estrecha">
    <header class="cab"><h1>Importar extracto</h1></header>
    <section class="tarjeta">
      <div style="display:flex;gap:14px;align-items:flex-start">${icono({ icono: 'banco', bg: 'var(--marca-suave)', fg: 'var(--marca)' })}
        <div><h2>Descarga los movimientos del banco</h2><p class="suave" style="margin:4px 0 0">En la banca digital de IberCaja: <em>Cuentas › Movimientos › Descargar en Excel</em>. El periodo da igual: lo que ya esté importado se ignora.</p></div></div>
      <div class="campo"><span>¿Qué vas a subir?</span><div class="segmentado" data-modo><button type="button" data-v="cuenta" class="${tipoArchivo.modo === 'cuenta' ? 'activo' : ''}">Cuenta del banco</button><button type="button" data-v="tarjeta" class="${tipoArchivo.modo === 'tarjeta' ? 'activo' : ''}">Extracto de tarjeta</button></div></div>
      ${tipoArchivo.modo === 'tarjeta' ? `<label class="campo"><span>Tarjeta</span><select data-tarjeta-imp>${s.tarjetas.map(t => `<option value="${esc(t.id.slice(2))}" ${tipoArchivo.tarjeta === t.id.slice(2) ? 'selected' : ''}>${esc(t.nombre)} (…${esc(t.id.slice(2))})</option>`).join('')}</select></label>
        <p class="tenue" style="margin:0">Cada compra de la tarjeta entra por separado y, desde la primera fecha de este extracto, la liquidación mensual de la tarjeta en tu cuenta cuenta como un simple pago, para no contar el gasto dos veces.</p>` : ''}
      <div class="botones"><button class="boton primario grande" data-acc="elegir" style="flex:1">${ICONOS.subir} Elegir archivo .xlsx o .csv</button></div>
      <p class="tenue" style="margin:10px 0 0">El archivo se lee en este dispositivo y no se sube a ningún sitio. En el ordenador también puedes arrastrarlo aquí.</p>
    </section>
    <div id="resultado-imp" style="margin-top:12px"></div>
    ${imps.length ? `<section class="tarjeta bloque"><div class="tarjeta-cab"><h2>Últimas importaciones</h2></div><div class="desplazable"><table class="tabla">
      ${imps.map(i => `<tr><td>${new Date(i.fecha).toLocaleDateString('es-ES')}<br><span class="tenue">${esc(i.archivo)}</span></td><td>${i.desde ? esc(fechaCorta(i.desde)) + ' – ' + esc(fechaCorta(i.hasta)) : ''}</td><td class="der">${i.n} nuevos${i.duplicados ? `<br><span class="tenue">${i.duplicados} ya estaban</span>` : ''}</td></tr>`).join('')}
    </table></div></section>` : ''}
  </div>`;
  $$('[data-modo] button', c).forEach(b => b.onclick = () => { tipoArchivo.modo = b.dataset.v; reanalizar(app); });
  c.querySelector('[data-tarjeta-imp]')?.addEventListener('change', e => { tipoArchivo.tarjeta = e.target.value; reanalizar(app); });
  c.querySelector('[data-acc=elegir]').onclick = async () => {
    const f = await elegirArchivo('.xlsx,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv');
    if (f) importarBuffer(app, f.name, await f.arrayBuffer());
  };
  c.ondragover = e => e.preventDefault();
  c.ondrop = async e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) importarBuffer(app, f.name, await f.arrayBuffer());
  };
  if (analisisActual) pintarAnalisis(app, analisisActual);
  else if (resultadoHtml) $('#resultado-imp', c).innerHTML = resultadoHtml;
}

function reanalizar(app) {
  if (analisisActual) importarBuffer(app, analisisActual.nombre, analisisActual.buffer).then(() => app.render());
  else app.render();
}

async function importarBuffer(app, nombre, buffer) {
  try {
    if (/tarjeta|visa|credito|crédito/i.test(nombre) && !analisisActual) tipoArchivo.modo = 'tarjeta';
    analisisActual = await app.servicio.analizarArchivo(nombre, buffer, { tarjeta: tipoArchivo.modo === 'tarjeta' ? tipoArchivo.tarjeta : null });
    resultadoHtml = '';
    if (!location.hash.startsWith('#/importar')) location.hash = '#/importar';
    else pintarAnalisis(app, analisisActual);
  } catch (e) { aviso(e.message, { error: true }); }
}

function pintarAnalisis(app, a) {
  const d = $('#resultado-imp');
  if (!d) return;
  d.innerHTML = `<section class="tarjeta">
    <div class="tarjeta-cab"><h2>${esc(a.nombre)}</h2></div>
    <table class="tabla">
      ${a.tarjetaExtracto ? `<tr><td>Extracto de tarjeta</td><td class="der">…${esc(a.tarjetaExtracto)}</td></tr>` : a.cuenta ? `<tr><td>Cuenta</td><td class="der">${esc(a.cuenta)}</td></tr>` : ''}
      <tr><td>Periodo</td><td class="der">${esc(fechaCorta(a.desde))} – ${esc(fechaCorta(a.hasta))}</td></tr>
      <tr><td>Movimientos en el archivo</td><td class="der">${a.movs.length}</td></tr>
      <tr><td>Nuevos</td><td class="der"><strong>${a.nuevos.length}</strong></td></tr>
      ${a.duplicados ? `<tr><td>Ya importados (se ignoran)</td><td class="der">${a.duplicados}</td></tr>` : ''}
      ${a.saldoFinal != null ? `<tr><td>Saldo final</td><td class="der num">${euros(a.saldoFinal)}</td></tr>` : ''}
      ${a.saldoOk != null ? `<tr><td>Comprobación de saldos</td><td class="der">${a.saldoOk ? '<span style="color:var(--marca);font-weight:600">✓ Cuadra</span>' : '<span style="color:var(--aviso);font-weight:600">⚠ No cuadra</span>'}</td></tr>` : ''}
    </table>
    ${a.avisos.length ? `<div class="nota">${a.avisos.map(esc).join('<br>')}</div>` : ''}
    <div class="botones">
      ${a.nuevos.length ? `<button class="boton primario grande" data-acc="importar" style="flex:1">Importar ${a.nuevos.length} nuevos</button>` : '<span class="suave">No hay nada nuevo que importar.</span>'}
      <button class="boton grande" data-acc="cancelar">Cancelar</button>
    </div></section>`;
  d.querySelector('[data-acc=cancelar]').onclick = () => { analisisActual = null; d.innerHTML = ''; };
  d.querySelector('[data-acc=importar]')?.addEventListener('click', async e => {
    e.target.disabled = true; e.target.textContent = 'Importando…';
    analisisActual = null;
    resultadoHtml = `<section class="tarjeta"><h2>Importando…</h2></section>`;
    const r = await app.servicio.confirmarImportacion(a);
    if (a.hasta) { app.filtros.mes = mesDe(a.hasta); app.guardarFiltros(); }
    const pintar = h => { resultadoHtml = h; const el = $('#resultado-imp'); if (el) el.innerHTML = h; };
    const aj = app.servicio.ajustes;
    const sinSug = r.movs.filter(m => m.estado === 'pendiente' && !m.cat && m.tipo !== 'traspaso').length;
    let textoIA = '';
    if (sinSug && aj.iaActiva && aj.apiKey) {
      pintar(`<section class="tarjeta"><h2>Importados ${r.total}</h2><p class="suave">Preguntando a la IA por los ${sinSug} que no reconozco…</p></section>`);
      try { const ia = await app.servicio.clasificarPendientesConIA(); textoIA = `<p>La IA ha sugerido categoría para <strong>${ia.n}</strong> de ${ia.total}.</p>`; }
      catch (err) { textoIA = `<p class="nota">La IA no pudo clasificar: ${esc(err.message)}</p>`; }
    }
    const pend = app.servicio.movs.filter(m => m.estado === 'pendiente').length;
    pintar(`<section class="tarjeta"><div style="display:flex;gap:14px;align-items:center">${icono({ icono: 'banco', bg: 'var(--marca-suave)', fg: 'var(--marca)' })}<h2>Importados ${r.total} movimientos</h2></div>
      <p><strong>${r.auto}</strong> clasificados automáticamente.</p>${textoIA}
      ${pend ? `<p>Quedan <strong>${pend}</strong> por revisar.</p><div class="botones"><a class="boton primario grande" href="#/buzon" style="flex:1">Revisar ahora</a><a class="boton grande" href="#/resumen">Ver resumen</a></div>` : '<p>Todo clasificado.</p><div class="botones"><a class="boton primario grande" href="#/resumen">Ver resumen</a></div>'}
    </section>`);
  });
}


// ===================== GRUPOS =====================
const gt = { tab: 'eventos', cerrados: false, abiertaNota: null };
function vistaGrupos(app, c, params) {
  const s = app.servicio;
  if (params.get('tab')) { gt.tab = params.get('tab'); history.replaceState(null, '', '#/grupos'); }
  const tabs = { eventos: 'Eventos', wallapop: 'Wallapop', euroimmun: 'Euroimmun' };
  let cuerpo = '';
  if (gt.tab === 'eventos') {
    const evs = s.grupos.filter(g => g.clase === 'evento').sort((a, b) => (b.creado || 0) - (a.creado || 0));
    const ab = evs.filter(g => !g.cerrado), ce = evs.filter(g => g.cerrado);
    cuerpo = `<section class="tarjeta"><div class="tarjeta-cab"><h2>Eventos abiertos</h2><button class="enlace" data-acc="nuevo-evento">${ICONOS.mas} Nuevo</button></div>
      ${ab.length ? ab.map(g => filaGrupo(app, g)).join('') : '<p class="suave">Crea un evento desde el pago de una cena, un cumpleaños o un viaje (en su ficha, «Añadir a un grupo»), y asígnale los Bizum que te devuelvan.</p>'}</section>
      ${ce.length ? `<section class="tarjeta"><div class="tarjeta-cab"><h2>Cerrados</h2><button class="enlace" data-acc="ver-cerrados">${gt.cerrados ? 'Ocultar' : `Ver ${ce.length}`}</button></div>${gt.cerrados ? ce.map(g => filaGrupo(app, g)).join('') : ''}</section>` : ''}`;
  } else if (gt.tab === 'wallapop') {
    const w = resumenWallapop(s.grupos, s.movs);
    const arts = s.grupos.filter(g => g.clase === 'articulo').sort((a, b) => (b.creado || 0) - (a.creado || 0));
    const enVenta = arts.filter(g => !resumenArticulo(g, s.movs).vendidoYa), vendidos = arts.filter(g => resumenArticulo(g, s.movs).vendidoYa);
    cuerpo = `<section class="tarjeta"><div class="mini-datos" style="margin:0;padding:0;border:0">
        <div><p>En venta</p><strong class="num">${w.enVenta} · ${euros(w.invertido)}</strong></div>
        <div><p>Vendidos</p><strong class="num">${w.vendidos}</strong></div>
        <div><p>Beneficio</p><strong class="num" style="color:${w.beneficio >= 0 ? 'var(--marca)' : 'var(--mal)'}">${euros(w.beneficio, true)}</strong></div></div>
        ${w.sueltos ? `<p class="tenue" style="margin:12px 0 0">${w.sueltos} movimientos de Wallapop sin artículo. <a href="#/movs?ambito=wallapop">Asígnalos</a> para ver el beneficio de cada cosa.</p>` : ''}</section>
      <section class="tarjeta"><div class="tarjeta-cab"><h2>En venta</h2><button class="enlace" data-acc="nuevo-articulo">${ICONOS.mas} Nuevo</button></div>${enVenta.length ? enVenta.map(g => filaGrupo(app, g)).join('') : '<p class="suave">Crea un artículo desde su compra (aunque la pagues en varias cuotas) y asígnale la venta cuando llegue.</p>'}</section>
      ${vendidos.length ? `<section class="tarjeta"><div class="tarjeta-cab"><h2>Vendidos</h2></div>${vendidos.map(g => filaGrupo(app, g)).join('')}</section>` : ''}`;
  } else {
    const cerradas = s.ajustes.notasCerradas || {};
    const notas = notasEuroimmun(s.movs, hoyIso(), cerradas);
    const t0084 = s.repo.obtener('tarjeta', 't_0084');
    const estadoTxt = { cobrada: 'Cobrada', parcial: 'Cobrada en parte', pendiente: 'Pendiente de cobro', cerrada: 'Cerrada a mano' };
    cuerpo = `<section class="tarjeta"><p class="suave" style="margin:0">Una nota por mes con los gastos de trabajo. El reembolso que llega el mes siguiente se asigna a la nota anterior; si no es así, cámbialo desde el propio cobro.</p>
      ${t0084?.detalleDesde ? `<p class="tenue" style="margin:8px 0 0">Usas el extracto detallado de la tarjeta …0084 desde el ${esc(fechaCorta(t0084.detalleDesde))}.</p>` : `<p class="tenue" style="margin:8px 0 0">Consejo: importa también el extracto de la tarjeta de empresa (en Importar, elige «Extracto de tarjeta»). Así cada compra va por separado y puedes marcar las personales.</p>`}</section>
      <section class="tarjeta">${notas.length ? notas.map(n => {
        const abierta = gt.abiertaNota === n.mes;
        return `<div><button class="cat-fila" data-nota="${n.mes}">${icono(ESTILO_NOTA)}<span class="cuerpo"><span class="linea"><span class="n">Nota de ${esc(nombreMes(n.mes).toLowerCase())}</span><span class="v num">${euros(n.gastado)}</span></span>
          <span class="det" style="color:${n.vencida ? 'var(--aviso)' : n.estado === 'cobrada' ? 'var(--marca)' : 'var(--texto-3)'}">${estadoTxt[n.estado]}${n.estado === 'pendiente' || n.estado === 'parcial' ? ` · faltan ${euros(n.pendiente)}` : ''}${n.cobrado ? ` · cobrado ${euros(n.cobrado)}` : ''}</span></span></button>
          ${abierta ? `<div class="subcats">${[...n.gastos, ...n.cobros].map(m => `<a href="#" data-mov="${esc(m.id)}"><span>${esc(fechaCorta(m.fecha))} · ${esc(nombreBonito(m, alias(app)))}</span><span class="num" style="color:${m.importe > 0 ? 'var(--ingreso)' : 'inherit'}">${euros(m.importe, true)}</span></a>`).join('')}
            ${n.estado !== 'cobrada' ? `<div class="botones"><button class="boton mini" data-cerrar-nota="${n.mes}">${n.estado === 'cerrada' ? 'Reabrir nota' : 'Dar por cerrada'}</button></div><p class="tenue" style="margin:6px 4px 0">Ciérrala si ya no vas a cobrar más (por ejemplo, porque el resto era personal). Dejará de avisarte.</p>` : ''}</div>` : ''}</div>`;
      }).join('') : '<p class="suave">Aún no hay gastos de trabajo.</p>'}</section>`;
  }
  c.innerHTML = `<div class="pagina estrecha"><header class="cab"><h1>Grupos</h1></header>
    <div class="pestanas" role="tablist">${Object.entries(tabs).map(([k, v]) => `<button class="pestana ${gt.tab === k ? 'activa' : ''}" data-tab="${k}" role="tab" aria-selected="${gt.tab === k}">${v}</button>`).join('')}</div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${cuerpo}</div></div>`;
  $$('[data-tab]', c).forEach(b => b.onclick = () => { gt.tab = b.dataset.tab; app.render(); });
  c.querySelector('[data-acc=ver-cerrados]')?.addEventListener('click', () => { gt.cerrados = !gt.cerrados; app.render(); });
  c.querySelector('[data-acc=nuevo-evento]')?.addEventListener('click', async () => { const id = await elegirGrupo(app, { clasePreferida: 'evento' }); if (id) location.hash = '#/grupo?id=' + id; });
  c.querySelector('[data-acc=nuevo-articulo]')?.addEventListener('click', async () => { const id = await elegirGrupo(app, { clasePreferida: 'articulo' }); if (id) location.hash = '#/grupo?id=' + id; });
  $$('[data-nota]', c).forEach(b => b.onclick = () => { gt.abiertaNota = gt.abiertaNota === b.dataset.nota ? null : b.dataset.nota; app.render(); });
  $$('[data-mov]', c).forEach(a => a.onclick = e => { e.preventDefault(); editarMovimiento(app, a.dataset.mov); });
  $$('[data-cerrar-nota]', c).forEach(b => b.onclick = async () => {
    const cerr = { ...(s.ajustes.notasCerradas || {}) };
    if (cerr[b.dataset.cerrarNota]) delete cerr[b.dataset.cerrarNota]; else cerr[b.dataset.cerrarNota] = true;
    await s.guardarAjustes({ notasCerradas: cerr });
  });
}

function vistaGrupo(app, c, params) {
  const s = app.servicio;
  const g = s.repo.obtener('grupo', params.get('id'));
  if (!g) { c.innerHTML = `<div class="pagina estrecha"><header class="cab"><h1>Grupo</h1></header><section class="tarjeta vacio"><p class="suave">Este grupo ya no existe.</p><a class="boton" href="#/grupos">Volver</a></section></div>`; return; }
  const ms = movsDeGrupo(g.id, s.movs);
  const porId = catsPorId(app), al = alias(app);
  let datos;
  if (g.clase === 'evento') {
    const r = resumenEvento(g, s.movs);
    datos = `<div class="mini-datos" style="margin:0;padding:0;border:0"><div><p>Pagaste</p><strong class="num">${euros(r.pagado)}</strong></div><div><p>Te devolvieron</p><strong class="num pos">${euros(r.devuelto)}</strong></div><div><p>Coste real</p><strong class="num">${euros(r.coste)}</strong></div></div>
      ${r.parte ? `<p class="suave" style="margin:12px 0 0">Entre ${g.personas} personas toca a ${euros(r.parte)}. ${r.faltan > 0 ? `<b>Faltan ${euros(r.faltan)} por devolver.</b>` : 'Ya está todo devuelto.'}</p>` : ''}`;
  } else {
    const r = resumenArticulo(g, s.movs);
    datos = `<div class="mini-datos" style="margin:0;padding:0;border:0"><div><p>Pagado${r.cuotas > 1 ? ` (${r.cuotas} pagos)` : ''}</p><strong class="num">${euros(r.pagado)}</strong></div><div><p>Vendido</p><strong class="num pos">${r.vendidoYa ? euros(r.vendido) : '—'}</strong></div><div><p>Beneficio</p><strong class="num" style="color:${(r.beneficio || 0) >= 0 ? 'var(--marca)' : 'var(--mal)'}">${r.beneficio != null ? euros(r.beneficio, true) : '—'}</strong></div></div>
      ${r.pendienteCuotas ? `<p class="suave" style="margin:12px 0 0">Precio total ${euros(g.precioCompra)}: quedan <b>${euros(r.pendienteCuotas)}</b> de cuotas por pagar.</p>` : ''}
      ${r.dias != null ? `<p class="tenue" style="margin:8px 0 0">${r.vendidoYa ? `Vendido en ${r.dias} días` : `En venta desde hace ${r.dias} días`}</p>` : ''}`;
  }
  c.innerHTML = `<div class="pagina estrecha">
    <header class="cab"><div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0"><a class="boton icono fantasma" href="#/grupos" aria-label="Volver">${ICONOS.izq}</a>${icono(g.clase === 'evento' ? ESTILO_EVENTO : ESTILO_ARTICULO)}<h1 style="font-size:22px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.nombre)}</h1></div></header>
    <section class="tarjeta">${datos}</section>
    <div class="dia-cab"><span>${ms.length} movimiento${ms.length !== 1 ? 's' : ''}</span></div>
    ${ms.length ? `<ul class="lista">${ms.map(m => filaMov(app, m, porId, al)).join('')}</ul>` : ''}
    <div class="botones"><button class="boton" data-acc="anadir">${ICONOS.mas} Añadir movimientos</button><button class="boton" data-acc="editar">Editar</button>
      <button class="boton" data-acc="cerrar">${g.cerrado ? 'Reabrir' : g.clase === 'articulo' ? 'Marcar como terminado' : 'Cerrar evento'}</button><button class="boton peligro" data-acc="borrar">Borrar grupo</button></div>
  </div>`;
  $$('.mov', c).forEach(li => li.onclick = () => editarMovimiento(app, li.dataset.id));
  c.querySelector('[data-acc=cerrar]').onclick = () => s.editarGrupo(g.id, { cerrado: !g.cerrado });
  c.querySelector('[data-acc=borrar]').onclick = async () => { if (await confirmar('¿Borrar el grupo? Los movimientos se quedan como estaban, solo dejan de estar agrupados.', { si: 'Borrar', peligro: true })) { await s.borrarGrupo(g.id); location.hash = '#/grupos'; } };
  c.querySelector('[data-acc=editar]').onclick = () => {
    const h = hoja(`<h2>Editar</h2><form><label class="campo"><span>Nombre</span><input type="text" name="nombre" value="${esc(g.nombre)}" required></label>
      ${g.clase === 'evento' ? `<label class="campo"><span>Personas que pagan a partes iguales</span><input type="number" name="personas" min="2" value="${g.personas || ''}"></label>` : `<label class="campo"><span>Precio total de compra (si lo pagas a plazos)</span><input type="number" name="precio" min="0" step="0.01" value="${g.precioCompra || ''}"></label>`}
      <div class="botones"><button class="boton primario grande" style="flex:1">Guardar</button></div></form>`);
    $('form', h.el).onsubmit = async e => { e.preventDefault(); const f = e.target; await s.editarGrupo(g.id, { nombre: f.nombre.value.trim(), personas: Number(f.personas?.value) || null, precioCompra: Number(f.precio?.value) || null }); h.cerrar(); };
  };
  c.querySelector('[data-acc=anadir]').onclick = () => anadirAGrupo(app, g);
}

// Buscar movimientos sin grupo y añadirlos
function anadirAGrupo(app, g) {
  const s = app.servicio, al = alias(app), porId = catsPorId(app);
  const ms = movsDeGrupo(g.id, s.movs);
  const ref = ms[0]?.fecha || hoyIso();
  const candidatos = s.movs.filter(m => !m.borrado && !m.dividido && !m.grupo && m.tipo !== 'traspaso')
    .sort((a, b) => Math.abs(new Date(a.fecha) - new Date(ref)) - Math.abs(new Date(b.fecha) - new Date(ref)));
  const elegidos = new Set();
  const h = hoja(`<h2>Añadir a «${esc(g.nombre)}»</h2>
    <label class="buscador"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span class="solo-lector">Buscar</span><input type="search" data-buscar placeholder="Buscar (Bizum, nombre, importe…)"></label>
    <ul class="lista" data-lista style="margin-top:10px;max-height:52vh;overflow:auto"></ul>
    <div class="botones"><button class="boton primario grande" data-ok style="flex:1" disabled>Añadir</button></div>`);
  const pintar = () => {
    const q = norm($('[data-buscar]', h.el).value);
    const lista = candidatos.filter(m => !q || norm(m.desc).includes(q) || norm(nombreBonito(m, al)).includes(q) || String(Math.abs(m.importe)).replace('.', ',').includes(q)).slice(0, 60);
    $('[data-lista]', h.el).innerHTML = lista.map(m => `<li class="mov" data-id="${esc(m.id)}" style="${elegidos.has(m.id) ? 'background:var(--marca-tinte)' : ''}">${elegidos.has(m.id) ? `<span class="ic" style="background:var(--marca);color:#fff">${ICONOS.check}</span>` : icono(estiloMovimiento(m, porId[m.cat]))}<div class="cuerpo"><div class="nombre">${esc(nombreBonito(m, al))}</div><div class="sub">${esc(fechaCorta(m.fecha))}${detalleOriginal(m) ? ' · ' + esc(detalleOriginal(m)) : ''}</div></div><div class="imp"><b class="num">${euros(m.importe, true)}</b></div></li>`).join('') || '<p class="tenue" style="padding:12px">Nada que coincida.</p>';
    $$('[data-lista] .mov', h.el).forEach(li => li.onclick = () => { elegidos.has(li.dataset.id) ? elegidos.delete(li.dataset.id) : elegidos.add(li.dataset.id); pintar(); });
    const b = $('[data-ok]', h.el); b.disabled = !elegidos.size; b.textContent = elegidos.size ? `Añadir ${elegidos.size}` : 'Añadir';
  };
  $('[data-buscar]', h.el).oninput = pintar;
  pintar();
  $('[data-ok]', h.el).onclick = async () => { await s.asignarGrupo([...elegidos], g.id); h.cerrar(); };
}

// Dividir un movimiento en partes (p. ej. la liquidación de la tarjeta de empresa)
function dividirMovimiento(app, m) {
  const s = app.servicio;
  const total = Math.abs(m.importe), signo = m.importe < 0 ? -1 : 1;
  const partes = [
    { importe: total, cat: m.cat, ambito: m.ambito || 'familia', tipo: m.tipo },
    { importe: 0, cat: null, ambito: 'familia', tipo: m.tipo === 'traspaso' ? (signo < 0 ? 'gasto' : 'ingreso') : m.tipo },
  ];
  const porId = catsPorId(app);
  const h = hoja(`<h2>Dividir movimiento</h2><p class="suave" style="margin:0">${esc(nombreBonito(m, alias(app)))} · <b class="num">${euros(m.importe, true)}</b>. Reparte el importe; por ejemplo, la parte de trabajo y la parte personal de la tarjeta de empresa.</p>
    <div data-partes></div>
    <div class="botones"><button type="button" class="boton" data-acc="mas">${ICONOS.mas} Otra parte</button></div>
    <p class="tenue" data-resto></p>
    <div class="botones"><button class="boton primario grande" data-ok style="flex:1">Dividir</button></div>`);
  const pintar = () => {
    $('[data-partes]', h.el).innerHTML = partes.map((p, i) => {
      const cat = porId[p.cat];
      return `<div class="tarjeta" style="background:var(--superficie-2);margin-top:10px;padding:12px 14px">
        <label class="campo" style="margin:0"><span>Parte ${i + 1} (€)</span><input type="number" step="0.01" min="0" data-i="${i}" data-f="importe" value="${p.importe || ''}" inputmode="decimal"></label>
        <div class="segmentado" style="margin-top:8px" role="group" aria-label="Ámbito de la parte ${i + 1}">${Object.entries(AMBITOS).map(([k, v]) => `<button type="button" data-i="${i}" data-amb="${k}" class="${p.ambito === k ? 'activo' : ''}">${v}</button>`).join('')}</div>
        <button type="button" class="boton-cat" data-i="${i}" data-cat style="margin-top:8px">${icono(estiloCategoria(cat), 'pq')}<span class="t">${esc(cat ? `${cat.grupo} › ${cat.nombre}` : 'Elegir categoría')}</span>${ICONOS.der}</button>
        ${partes.length > 2 ? `<button type="button" class="enlace" data-quitar="${i}" style="margin-top:6px">Quitar parte</button>` : ''}</div>`;
    }).join('');
    const resto = Math.round((total - partes.reduce((a, p) => a + (Number(p.importe) || 0), 0)) * 100) / 100;
    $('[data-resto]', h.el).innerHTML = resto === 0 ? '<span style="color:var(--marca)">✓ Cuadra con el total</span>' : `${resto > 0 ? 'Faltan' : 'Sobran'} ${euros(Math.abs(resto))} para cuadrar`;
    $$('[data-f=importe]', h.el).forEach(inp => inp.oninput = () => {
      partes[inp.dataset.i].importe = Number(inp.value) || 0;
      const r = Math.round((total - partes.reduce((a, p) => a + (Number(p.importe) || 0), 0)) * 100) / 100;
      $('[data-resto]', h.el).innerHTML = r === 0 ? '<span style="color:var(--marca)">✓ Cuadra con el total</span>' : `${r > 0 ? 'Faltan' : 'Sobran'} ${euros(Math.abs(r))} para cuadrar`;
    });
    $$('[data-amb]', h.el).forEach(b => b.onclick = () => { partes[b.dataset.i].ambito = b.dataset.amb; pintar(); });
    $$('[data-cat]', h.el).forEach(b => b.onclick = async () => {
      const p = partes[b.dataset.i];
      const v = await seleccionarCategoria(app, { actual: p.cat, tipo: signo < 0 ? 'gasto' : 'ingreso' });
      if (v) { p.cat = v; p.tipo = signo < 0 ? 'gasto' : (porId[v]?.tipo === 'ingreso' ? 'ingreso' : 'reembolso'); ajustarAmbito(p); pintar(); }
    });
    $$('[data-quitar]', h.el).forEach(b => b.onclick = () => { partes.splice(Number(b.dataset.quitar), 1); pintar(); });
  };
  pintar();
  $('[data-acc=mas]', h.el).onclick = () => { partes.push({ importe: 0, cat: null, ambito: 'familia', tipo: signo < 0 ? 'gasto' : 'ingreso' }); pintar(); };
  $('[data-ok]', h.el).onclick = async () => {
    const validas = partes.filter(p => Number(p.importe) > 0);
    if (validas.length < 2) return aviso('Hacen falta al menos dos partes con importe', { error: true });
    if (validas.some(p => !p.cat)) return aviso('Elige la categoría de cada parte', { error: true });
    try {
      await s.dividirMov(m.id, validas.map(p => ({ importe: signo * Number(p.importe), tipo: p.tipo === 'traspaso' ? (signo < 0 ? 'gasto' : 'ingreso') : p.tipo, cat: p.cat, ambito: p.ambito })));
      aviso('Movimiento dividido');
      document.querySelectorAll('.velo').forEach(v => v.remove());
    } catch (e) { aviso(e.message, { error: true }); }
  };
}

// ===================== MÁS (móvil) =====================
function vistaMas(app, c) {
  const item = (href, ic, t, sub) => `<a href="${href}">${icono(ic)}<span class="t">${t}${sub ? `<br><span class="tenue" style="font-weight:400">${sub}</span>` : ''}</span>${ICONOS.der}</a>`;
  c.innerHTML = `<div class="pagina estrecha"><header class="cab"><h1>Más</h1></header>
    <section class="tarjeta lista-mas" style="padding:6px">
      ${item('#/grupos', ESTILO_EVENTO, 'Grupos', 'Eventos, Wallapop y notas de Euroimmun')}
      ${item('#/evolucion', { icono: 'repetir', bg: '#E5EEFB', fg: '#1D58B8' }, 'Evolución', 'Ingresos y gastos mes a mes')}
      ${item('#/importar', { icono: 'banco', bg: 'var(--marca-suave)', fg: 'var(--marca)' }, 'Importar extracto', 'Subir el Excel del banco')}
      ${item('#/ajustes', { icono: 'llave', bg: '#EFEEEA', fg: '#4A4C52' }, 'Ajustes', 'Tarjetas, categorías, reglas, IA, familia')}
    </section></div>`;
}

export const vistas = { resumen: inicio, buzon: vistaRevisar, movs: vistaMovs, evolucion: vistaEvolucion, importar: vistaImportar, mas: vistaMas, grupos: vistaGrupos, grupo: vistaGrupo, importarBuffer };
