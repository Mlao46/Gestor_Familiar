// Pantallas principales: Resumen, Buzón, Movimientos, Evolución e Importar.
import { esc, $, $$, aviso, hoja, confirmar, opcionesCategorias, opcionesTipo, opcionesAmbito, fechaCorta, fechaLarga, elegirArchivo, ICONOS } from './ui.js';
import { euros, nombreMes, mesAnterior, mesDe, hoyIso, norm, agruparPor } from './core/util.js';
import { filtrar, totales, porCategoria, ingresosPorCategoria, evolucion, cuentaAparte, gastoNeto, mediasPorCategoria } from './core/calculos.js';
import { AMBITOS, TIPOS } from './core/categorias.js';
import { esBizum, mensajeBizum, claveAprendizaje } from './core/clasificador.js';

const AMBITOS_FILTRO = { familia: 'Familia', wallapop: 'Wallapop', euroimmun: 'Euroimmun', todo: 'Todo' };

function cabecera(titulo, extra = '') {
  return `<header class="cabecera"><h1>${esc(titulo)}</h1>${extra}</header>`;
}

function selectorMes(app) {
  return `<div class="mes"><button class="boton icono" data-mes="-1" aria-label="Mes anterior">${ICONOS.izq}</button>
    <strong>${esc(nombreMes(app.filtros.mes))}</strong>
    <button class="boton icono" data-mes="1" aria-label="Mes siguiente">${ICONOS.der}</button></div>`;
}

function chipsAmbito(app) {
  return `<div class="chips" role="group" aria-label="Ámbito">${Object.entries(AMBITOS_FILTRO).map(([k, v]) =>
    `<button class="chip ${app.filtros.ambito === k ? 'activo' : ''}" data-ambito="${k}">${v}</button>`).join('')}</div>`;
}

function selectorTarjeta(app, id = 'f-tarjeta') {
  const ts = app.servicio.tarjetas.filter(t => app.servicio.movs.some(m => m.tarjeta === t.id.slice(2)));
  if (!ts.length) return '';
  return `<select id="${id}" aria-label="Tarjeta">
    <option value="todas">Todas las tarjetas y recibos</option>
    ${ts.map(t => `<option value="${esc(t.id.slice(2))}" ${app.filtros.tarjeta === t.id.slice(2) ? 'selected' : ''}>${esc(t.nombre)} (…${esc(t.id.slice(2))})</option>`).join('')}
    <option value="sin" ${app.filtros.tarjeta === 'sin' ? 'selected' : ''}>Sin tarjeta (recibos, Bizum, transferencias)</option>
  </select>`;
}

function enlazarFiltros(app, c) {
  $$('[data-mes]', c).forEach(b => b.onclick = () => { app.filtros.mes = mesAnterior(app.filtros.mes, -Number(b.dataset.mes)); app.guardarFiltros(); app.render(); });
  $$('[data-ambito]', c).forEach(b => b.onclick = () => { app.filtros.ambito = b.dataset.ambito; app.guardarFiltros(); app.render(); });
  const t = $('#f-tarjeta', c);
  if (t) t.onchange = () => { app.filtros.tarjeta = t.value; app.guardarFiltros(); app.render(); };
}

function barra(valor, max, pres, clase = '') {
  const pct = max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
  const pasado = pres > 0 && valor > pres;
  const marca = pres > 0 && max > 0 ? `<i class="marca-pres" style="left:${Math.min(100, (pres / max) * 100)}%" title="Presupuesto ${euros(pres)}"></i>` : '';
  return `<div class="pista"><div class="relleno ${clase} ${pasado ? 'pasado' : ''}" style="width:${pct}%"></div>${marca}</div>`;
}

// ===================== RESUMEN =====================
function resumen(app, c) {
  const s = app.servicio;
  const movsMes = filtrar(s.movs, app.filtros);
  const t = totales(movsMes);
  const pendientes = s.movs.filter(m => m.estado === 'pendiente').length;
  const grupos = porCategoria(movsMes, s.cats);
  const ingresos = ingresosPorCategoria(movsMes, s.cats);
  const max = Math.max(1, ...grupos.map(g => Math.max(g.neto, g.presupuesto)));
  const abiertos = app._abiertos ??= new Set();

  let extra = '';
  if (app.filtros.ambito === 'familia' || app.filtros.ambito === 'todo') {
    const eu = cuentaAparte(s.movs, 'euroimmun');
    const wa = cuentaAparte(s.movs.filter(m => mesDe(m.fecha) === app.filtros.mes), 'wallapop');
    if (eu.n || wa.n) extra = `<div class="kpis" style="grid-template-columns:1fr 1fr">
      ${eu.n ? `<button class="kpi" data-ambito="euroimmun" style="text-align:left;cursor:pointer"><span>Euroimmun ${eu.saldo < 0 ? 'te debe' : 'a tu favor'}</span><strong class="num">${euros(Math.abs(eu.saldo))}</strong><small>Gastado ${euros(eu.salidas)} · devuelto ${euros(eu.entradas)}</small></button>` : ''}
      ${wa.n ? `<button class="kpi" data-ambito="wallapop" style="text-align:left;cursor:pointer"><span>Wallapop este mes</span><strong class="num ${wa.saldo >= 0 ? 'pos' : ''}">${euros(wa.saldo, true)}</strong><small>Ventas ${euros(wa.entradas)} · compras ${euros(wa.salidas)}</small></button>` : ''}
    </div>`;
  }

  let porTarjeta = '';
  if (app.filtros.tarjeta === 'todas') {
    const filas = [...agruparPor(movsMes.filter(m => m.tipo === 'gasto' || m.tipo === 'reembolso'), m => m.tarjeta || '')]
      .map(([k, l]) => ({ k, nombre: k ? s.nombreTarjeta(k) : 'Recibos, Bizum y otros', total: l.reduce((a, m) => a + gastoNeto(m), 0), n: l.length }))
      .sort((a, b) => b.total - a.total);
    if (filas.length > 1) porTarjeta = `<section class="tarjeta"><h2>Gasto por tarjeta <small>toca para filtrar</small></h2>
      <table class="tabla">${filas.map(f => `<tr data-tarjeta="${esc(f.k || 'sin')}" style="cursor:pointer"><td>${esc(f.nombre)}</td><td class="der tenue">${f.n}</td><td class="der num">${euros(f.total)}</td></tr>`).join('')}</table></section>`;
  }

  c.innerHTML = `
  ${cabecera('Resumen', `<a class="boton primario mini" href="#/importar">${ICONOS.subir} Importar</a>`)}
  <main class="contenido">
    <div class="fila" style="flex-wrap:wrap">${selectorMes(app)}</div>
    ${chipsAmbito(app)}
    ${selectorTarjeta(app)}
    ${pendientes ? `<a class="aviso-buzon" href="#/buzon"><span>${pendientes} movimiento${pendientes > 1 ? 's' : ''} por revisar</span>${ICONOS.der}</a>` : ''}
    <div class="kpis">
      <div class="kpi"><span>Ingresos</span><strong class="num">${euros(t.ingresos)}</strong></div>
      <div class="kpi"><span>Gastos</span><strong class="num">${euros(t.gastos)}</strong>${t.reembolsos ? `<small>con ${euros(t.reembolsos)} recuperados</small>` : ''}</div>
      <div class="kpi"><span>Balance</span><strong class="num ${t.balance >= 0 ? 'pos' : ''}">${euros(t.balance, true)}</strong></div>
    </div>
    ${extra}
    <section class="tarjeta"><h2>Gastos <small>${grupos.length ? 'toca un grupo para ver el detalle' : ''}</small></h2>
      ${grupos.length ? grupos.map(g => `
        <div class="grupo">
          <button data-grupo="${esc(g.grupo)}" aria-expanded="${abiertos.has(g.grupo)}">
            <div class="linea"><span class="nombre">${esc(g.grupo)}</span><span class="num">${euros(g.neto)}${g.presupuesto ? ` <span class="tenue">/ ${euros(g.presupuesto)}</span>` : ''}</span></div>
            ${barra(g.neto, max, g.presupuesto)}
          </button>
          ${abiertos.has(g.grupo) ? `<div class="subcats">${g.cats.map(ct => `
            <a href="#/movs?cat=${esc(ct.id)}&mes=${app.filtros.mes}"><div class="linea"><span>${esc(ct.nombre)} <span class="tenue">· ${ct.n}</span></span><span class="num">${euros(ct.neto)}${ct.presupuesto ? ` <span class="tenue">/ ${euros(ct.presupuesto)}</span>` : ''}</span></div>
            ${ct.presupuesto ? barra(ct.neto, Math.max(ct.neto, ct.presupuesto), ct.presupuesto) : ''}</a>`).join('')}</div>` : ''}
        </div>`).join('') : '<p class="tenue">No hay gastos en este mes con estos filtros.</p>'}
    </section>
    ${ingresos.length ? `<section class="tarjeta"><h2>Ingresos</h2>
      ${ingresos.map(i => `<a href="#/movs?cat=${esc(i.id)}&mes=${app.filtros.mes}" style="color:inherit;text-decoration:none"><div class="linea" style="padding:6px 0"><span>${esc(i.nombre)} <span class="tenue">· ${i.n}</span></span><span class="num">${euros(i.total)}</span></div></a>`).join('')}
    </section>` : ''}
    ${porTarjeta}
    ${t.traspasos ? `<p class="tenue">Los traspasos entre tus cuentas (${euros(t.traspasos, true)}) no cuentan como ingreso ni gasto.</p>` : ''}
  </main>`;
  enlazarFiltros(app, c);
  $$('[data-grupo]', c).forEach(b => b.onclick = () => { const g = b.dataset.grupo; abiertos.has(g) ? abiertos.delete(g) : abiertos.add(g); app.render(); });
  $$('[data-tarjeta]', c).forEach(r => r.onclick = () => { app.filtros.tarjeta = r.dataset.tarjeta; app.guardarFiltros(); app.render(); });
}

// ===================== BUZÓN =====================
const buzon = { limite: 60 };
function vistaBuzon(app, c) {
  const s = app.servicio;
  const aj = s.ajustes;
  const pend = s.movs.filter(m => m.estado === 'pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha) || Math.abs(b.importe) - Math.abs(a.importe));
  const conSug = pend.filter(m => m.cat || m.tipo === 'traspaso');
  const sinSug = pend.filter(m => !m.cat && m.tipo !== 'traspaso');
  const iaLista = aj.iaActiva && aj.apiKey;
  const cats = s.cats;
  c.innerHTML = `
  ${cabecera('Buzón', `<a class="boton mini" href="#/importar">${ICONOS.subir} Importar</a>`)}
  <main class="contenido">
    ${!pend.length ? `<section class="tarjeta" style="text-align:center"><h2 style="justify-content:center">Todo al día</h2>
      <p class="suave">No hay movimientos por revisar.</p><a class="boton primario" href="#/importar">${ICONOS.subir} Importar extracto del banco</a></section>` : `
    <p class="suave">${pend.length} por revisar · ${conSug.length} con sugerencia. Al confirmar, la app aprende y aplica lo aprendido al resto.</p>
    <div class="botones">
      ${conSug.length ? `<button class="boton primario" data-acc="todos">${ICONOS.check} Confirmar las ${conSug.length} sugerencias</button>` : ''}
      ${sinSug.length && iaLista ? `<button class="boton" data-acc="ia">Clasificar ${sinSug.length} con IA</button>` : ''}
      ${sinSug.length && !iaLista ? `<a class="boton" href="#/ajustes?abrir=ia">Activar la IA para los ${sinSug.length} sin sugerencia</a>` : ''}
    </div>
    <div id="lista-pend">${pend.slice(0, buzon.limite).map(m => tarjetaPendiente(app, m, cats)).join('')}</div>
    ${pend.length > buzon.limite ? `<div class="botones"><button class="boton" data-acc="mas">Ver más (${pend.length - buzon.limite})</button></div>` : ''}`}
  </main>`;

  c.querySelector('[data-acc=todos]')?.addEventListener('click', async e => {
    e.target.disabled = true;
    const r = await s.confirmar(conSug.map(m => m.id));
    const n = await s.reclasificarPendientes();
    aviso(`${r.movs} confirmados${r.reglas ? ` · ${r.reglas} reglas aprendidas` : ''}${n ? ` · ${n} reclasificados` : ''}`);
  });
  c.querySelector('[data-acc=ia]')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Clasificando…';
    try {
      const r = await s.clasificarPendientesConIA((h, t) => { b.textContent = `Clasificando… ${h}/${t}`; });
      aviso(`La IA ha sugerido ${r.n} de ${r.total}. Revísalos y confirma.`);
    } catch (err) { aviso(err.message, { error: true }); b.disabled = false; b.textContent = 'Reintentar con IA'; }
  });
  c.querySelector('[data-acc=mas]')?.addEventListener('click', () => { buzon.limite += 60; app.render(); });

  $$('.pendiente', c).forEach(el => {
    const id = el.dataset.id;
    const selTipo = $('[name=tipo]', el), selCat = $('[name=cat]', el), selAmb = $('[name=ambito]', el);
    selTipo.onchange = () => {
      selCat.innerHTML = opcionesCategorias(cats, selCat.value, { tipo: selTipo.value, vacia: selTipo.value === 'traspaso' ? '— (no aplica)' : 'Elige categoría…' });
      selCat.disabled = selTipo.value === 'traspaso';
    };
    selCat.onchange = () => {
      const amb = { 'eur-gastos': 'euroimmun', 'ing-euroimmun': 'euroimmun', 'wal-compras': 'wallapop', 'ing-wallapop': 'wallapop' }[selCat.value];
      if (amb) selAmb.value = amb;
    };
    $('[data-ok]', el).onclick = async () => {
      if (!selCat.value && selTipo.value !== 'traspaso') { aviso('Elige una categoría', { error: true }); selCat.focus(); return; }
      el.style.opacity = .4;
      const m = s.repo.obtener('mov', id);
      await s.confirmar(id, { tipo: selTipo.value, cat: selCat.value || null, ambito: selAmb.value });
      const n = await s.reclasificarPendientes();
      const clave = claveAprendizaje(m);
      aviso(n ? `Aprendido «${clave}»: aplicado a ${n} más` : 'Confirmado');
    };
    $('[data-detalle]', el).onclick = () => editarMovimiento(app, id);
  });
}

function tarjetaPendiente(app, m, cats) {
  const s = app.servicio;
  const tarjeta = m.tarjeta ? s.nombreTarjeta(m.tarjeta) : null;
  const msg = esBizum(m) ? mensajeBizum(m) : '';
  return `<article class="pendiente ${m.cat || m.tipo === 'traspaso' ? 'con-sugerencia' : ''}" data-id="${esc(m.id)}">
    <div class="cab">
      <div style="min-width:0"><div class="desc">${esc(m.desc)}</div>
        <div class="tenue">${esc(fechaCorta(m.fecha))}${m.tipoOp && m.tipoOp !== 'TARJETA VISA' ? ' · ' + esc(m.tipoOp.toLowerCase()) : ''}${tarjeta ? ' · ' + esc(tarjeta) : ''}
        ${m.origen === 'ia' ? ' <span class="etiqueta ia">IA</span>' : m.motivo && m.cat ? ` <span class="etiqueta">${esc(m.motivo)}</span>` : ''}</div>
        ${msg ? `<div class="tenue">«${esc(msg)}»</div>` : ''}
      </div>
      <div class="num imp" style="font-weight:700;white-space:nowrap">${euros(m.importe, true)}</div>
    </div>
    <div class="controles">
      <select name="tipo" aria-label="Tipo">${opcionesTipo(m.tipo)}</select>
      <select name="cat" aria-label="Categoría" ${m.tipo === 'traspaso' ? 'disabled' : ''}>${opcionesCategorias(cats, m.cat, { tipo: m.tipo, vacia: m.tipo === 'traspaso' ? '— (no aplica)' : 'Elige categoría…' })}</select>
    </div>
    <div class="acciones"><select name="ambito" aria-label="Ámbito">${opcionesAmbito(m.ambito)}</select><button class="boton mini" data-detalle>Más</button><button class="boton primario mini" data-ok>${ICONOS.check} Confirmar</button></div>
  </article>`;
}

// ===================== MOVIMIENTOS =====================
const fm = { texto: '', periodo: 'mes', cat: '', tipo: '', limite: 200 };
function vistaMovs(app, c, params) {
  const s = app.servicio;
  if (params.has('cat')) { fm.cat = params.get('cat'); fm.periodo = 'mes'; if (params.get('mes')) app.filtros.mes = params.get('mes'); history.replaceState(null, '', '#/movs'); }
  const base = filtrar(s.movs, { ...app.filtros, mes: fm.periodo === 'mes' ? app.filtros.mes : null });
  const q = norm(fm.texto);
  const lista = base.filter(m =>
    (!fm.cat || m.cat === fm.cat || (fm.cat === '_sin' && !m.cat && m.tipo !== 'traspaso')) &&
    (!fm.tipo || m.tipo === fm.tipo) &&
    (!q || norm(m.desc).includes(q) || norm(m.nota).includes(q) || String(Math.abs(m.importe)).includes(q.replace(',', '.'))))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
  const t = totales(lista);
  const catsPorId = Object.fromEntries(s.catsTodas.map(x => [x.id, x]));
  const dias = agruparPor(lista.slice(0, fm.limite), m => m.fecha);
  c.innerHTML = `
  ${cabecera('Movimientos', `<button class="boton mini" data-acc="nuevo">${ICONOS.mas} Añadir</button>`)}
  <main class="contenido">
    <input type="search" id="buscar" placeholder="Buscar comercio, nota o importe" value="${esc(fm.texto)}" autocomplete="off">
    <div class="chips" style="margin-top:8px">
      <button class="chip ${fm.periodo === 'mes' ? 'activo' : ''}" data-periodo="mes">${esc(nombreMes(app.filtros.mes))}</button>
      <button class="chip ${fm.periodo === 'todo' ? 'activo' : ''}" data-periodo="todo">Todo</button>
      ${Object.entries(AMBITOS_FILTRO).map(([k, v]) => `<button class="chip ${app.filtros.ambito === k ? 'activo' : ''}" data-ambito="${k}">${v}</button>`).join('')}
    </div>
    ${fm.periodo === 'mes' ? selectorMes(app) : ''}
    <div class="fila" style="margin-top:6px">
      <select id="f-cat" aria-label="Categoría">${opcionesCategorias(s.cats, fm.cat, { vacia: 'Todas las categorías' })}<option value="_sin" ${fm.cat === '_sin' ? 'selected' : ''}>Sin categoría</option></select>
      <select id="f-tipo" aria-label="Tipo"><option value="">Todos los tipos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${fm.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div>
    <div style="margin-top:6px">${selectorTarjeta(app)}</div>
    <p class="tenue">${lista.length} movimientos · gastos ${euros(t.gastos)} · ingresos ${euros(t.ingresos)}</p>
    <section class="tarjeta" style="padding-top:2px">
      ${lista.length ? [...dias].map(([d, ms]) => `<div class="dia">${esc(fechaLarga(d))}</div><ul class="lista-movs">${ms.map(m => filaMov(app, m, catsPorId)).join('')}</ul>`).join('') : '<p class="tenue">Nada con estos filtros.</p>'}
      ${lista.length > fm.limite ? `<div class="botones"><button class="boton" data-acc="mas">Ver más</button></div>` : ''}
    </section>
  </main>`;
  enlazarFiltros(app, c);
  const b = $('#buscar', c);
  let tb; b.oninput = () => { clearTimeout(tb); tb = setTimeout(() => { fm.texto = b.value; app.render(); }, 200); };
  $$('[data-periodo]', c).forEach(x => x.onclick = () => { fm.periodo = x.dataset.periodo; app.render(); });
  $('#f-cat', c).onchange = e => { fm.cat = e.target.value; app.render(); };
  $('#f-tipo', c).onchange = e => { fm.tipo = e.target.value; app.render(); };
  c.querySelector('[data-acc=mas]')?.addEventListener('click', () => { fm.limite += 200; app.render(); });
  c.querySelector('[data-acc=nuevo]').onclick = () => nuevoMovimiento(app);
  $$('.mov', c).forEach(li => li.onclick = () => editarMovimiento(app, li.dataset.id));
}

function filaMov(app, m, catsPorId) {
  const cat = catsPorId[m.cat];
  const tarjeta = m.tarjeta ? app.servicio.nombreTarjeta(m.tarjeta) : null;
  return `<li class="mov" data-id="${esc(m.id)}" tabindex="0">
    <div class="cuerpo"><div class="desc">${esc(m.desc)}</div>
      <div class="meta">${cat ? `<span>${esc(cat.grupo)} › ${esc(cat.nombre)}</span>` : m.tipo === 'traspaso' ? '' : '<span>Sin categoría</span>'}
        ${m.tipo !== 'gasto' && m.tipo !== 'ingreso' ? `<span class="etiqueta tipo-${m.tipo}">${TIPOS[m.tipo]}</span>` : ''}
        ${m.ambito && m.ambito !== 'familia' ? `<span class="etiqueta">${esc(AMBITOS[m.ambito])}</span>` : ''}
        ${tarjeta ? `<span>${esc(tarjeta)}</span>` : ''}
        ${m.estado === 'pendiente' ? '<span class="etiqueta" style="background:var(--gasto);color:#fff">por revisar</span>' : ''}
        ${m.nota ? `<span>📝 ${esc(m.nota)}</span>` : ''}</div></div>
    <div class="imp num ${m.importe > 0 ? 'pos' : ''}">${euros(m.importe, true)}</div>
  </li>`;
}

function editarMovimiento(app, id) {
  const s = app.servicio;
  const m = s.repo.obtener('mov', id);
  if (!m) return;
  const tarjeta = m.tarjeta ? s.nombreTarjeta(m.tarjeta) : null;
  const clave = claveAprendizaje(m);
  const h = hoja(`
    <h2>${esc(m.desc)}</h2>
    <p class="tenue">${esc(fechaLarga(m.fecha))}${m.tipoOp ? ' · ' + esc(m.tipoOp.toLowerCase()) : ''}${tarjeta ? ' · ' + esc(tarjeta) : ''}${m.saldo != null ? ' · saldo ' + euros(m.saldo) : ''}</p>
    <p style="font-size:22px;font-weight:700;margin:4px 0" class="num">${euros(m.importe, true)}</p>
    <form>
      <div class="fila">
        <label class="campo"><span>Tipo</span><select name="tipo">${opcionesTipo(m.tipo)}</select></label>
        <label class="campo"><span>Ámbito</span><select name="ambito">${opcionesAmbito(m.ambito)}</select></label>
      </div>
      <label class="campo"><span>Categoría</span><select name="cat">${opcionesCategorias(s.cats, m.cat, { tipo: m.tipo, vacia: 'Sin categoría' })}</select></label>
      <label class="campo"><span>Nota</span><input type="text" name="nota" value="${esc(m.nota || '')}" placeholder="Opcional"></label>
      ${clave ? `<label class="interruptor"><span>Recordar para «${esc(clave)}» en adelante</span><input type="checkbox" name="aprender" ${m.estado === 'pendiente' ? 'checked' : ''}></label>` : ''}
      <p class="tenue">${m.origen === 'ia' ? 'Sugerido por la IA. ' : ''}${m.motivo ? esc(m.motivo) : ''}</p>
      <div class="botones">
        <button class="boton primario" type="submit">${m.estado === 'pendiente' ? 'Confirmar' : 'Guardar'}</button>
        <button class="boton" type="button" data-cerrar>Cerrar</button>
        <button class="boton peligro" type="button" data-borrar style="margin-left:auto">Borrar</button>
      </div>
    </form>`);
  const f = $('form', h.el);
  f.tipo.onchange = () => { f.cat.innerHTML = opcionesCategorias(s.cats, f.cat.value, { tipo: f.tipo.value }); };
  f.onsubmit = async e => {
    e.preventDefault();
    const cambios = { tipo: f.tipo.value, cat: f.cat.value || null, ambito: f.ambito.value, nota: f.nota.value.trim() };
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
  const h = hoja(`<h2>Añadir movimiento</h2><p class="tenue">Para gastos en efectivo o cosas que no salen en el banco.</p>
    <form>
      <div class="fila"><label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${hoyIso()}" required></label>
      <label class="campo"><span>Importe (€)</span><input type="number" name="importe" step="0.01" min="0.01" required inputmode="decimal"></label></div>
      <label class="campo"><span>Concepto</span><input type="text" name="desc" value="Efectivo" required></label>
      <div class="fila"><label class="campo"><span>Tipo</span><select name="tipo">${opcionesTipo('gasto')}</select></label>
      <label class="campo"><span>Ámbito</span><select name="ambito">${opcionesAmbito('familia')}</select></label></div>
      <label class="campo"><span>Categoría</span><select name="cat" required>${opcionesCategorias(s.cats, '', { tipo: 'gasto', vacia: 'Elige…' })}</select></label>
      <div class="botones"><button class="boton primario">Guardar</button><button type="button" class="boton" data-cerrar>Cancelar</button></div>
    </form>`);
  const f = $('form', h.el);
  f.tipo.onchange = () => { f.cat.innerHTML = opcionesCategorias(s.cats, '', { tipo: f.tipo.value, vacia: 'Elige…' }); };
  f.onsubmit = async e => {
    e.preventDefault();
    await s.crearMovManual({ fecha: f.fecha.value, desc: f.desc.value.trim(), importe: f.importe.value, tipo: f.tipo.value, cat: f.cat.value || null, ambito: f.ambito.value });
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
  c.innerHTML = `
  ${cabecera('Evolución')}
  <main class="contenido">
    <div class="fila" style="flex-wrap:wrap">${selectorMes(app)}</div>
    ${chipsAmbito(app)}
    ${selectorTarjeta(app)}
    ${serie.length ? `
    <section class="tarjeta"><h2>Ingresos y gastos por mes <small>hasta ${esc(nombreMes(app.filtros.mes))}</small></h2>
      <div class="leyenda"><span><i style="background:var(--ingreso)"></i>Ingresos</span><span><i style="background:var(--gasto)"></i>Gastos</span></div>
      ${graficoMeses(serie)}
      <p class="tenue">Media mensual: ingresos ${euros(mediaIng)} · gastos ${euros(mediaGasto)} · ahorro ${euros(mediaIng - mediaGasto, true)}</p>
    </section>
    <section class="tarjeta"><h2>Mes a mes</h2>
      <table class="tabla"><thead><tr><th>Mes</th><th class="der">Ingresos</th><th class="der">Gastos</th><th class="der">Balance</th></tr></thead>
      <tbody>${serie.slice().reverse().map(x => `<tr><td>${esc(nombreMes(x.mes))}</td><td class="der num">${x.vacio ? '—' : euros(x.ingresos)}</td><td class="der num">${x.vacio ? '—' : euros(x.gastos)}</td><td class="der num ${x.balance >= 0 ? 'pos' : ''}">${x.vacio ? '—' : euros(x.balance, true)}</td></tr>`).join('')}</tbody></table>
    </section>
    <section class="tarjeta"><h2>Gasto medio por grupo <small>últimos 6 meses con datos</small></h2>
      <table class="tabla"><thead><tr><th>Grupo</th><th class="der">Media/mes</th><th class="der">Presupuesto</th></tr></thead>
      <tbody>${gruposOrden.map(([g, v]) => `<tr><td>${esc(g)}</td><td class="der num">${euros(v.media)}</td><td class="der num tenue">${v.pres ? euros(v.pres) : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="tenue">Puedes fijar presupuestos con estas medias en Ajustes › Categorías.</p>
    </section>` : '<section class="tarjeta"><p class="tenue">Aún no hay datos para este periodo.</p></section>'}
  </main>`;
  enlazarFiltros(app, c);
  activarTooltips(c);
}

function graficoMeses(serie) {
  // El ancho del dibujo se ajusta a la pantalla para que los textos no encojan en el móvil
  const W = Math.round(Math.max(300, Math.min(700, innerWidth - 64))), H = 230, mi = 44, md = 6, ms = 10, mb = 26;
  const maxV = Math.max(1, ...serie.map(x => Math.max(x.ingresos, x.gastos)));
  const paso = niceStep(maxV / 4);
  const top = Math.ceil(maxV / paso) * paso;
  const y = v => ms + (H - ms - mb) * (1 - v / top);
  const anchoGrupo = (W - mi - md) / serie.length;
  const bw = Math.min(22, (anchoGrupo - 10) / 2);
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
  serie.forEach((x, i) => {
    const cx = mi + i * anchoGrupo + anchoGrupo / 2;
    g += columna(cx - bw - 1, x.ingresos, 'var(--ingreso)') + columna(cx + 1, x.gastos, 'var(--gasto)');
    const [a, m] = x.mes.split('-');
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}${m === '01' || i === 0 ? " '" + a.slice(2) : ''}</text>`;
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
      const p = e.touches?.[0] || e;
      const w = tip.offsetWidth;
      tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, p.clientX - w / 2)) + 'px';
      tip.style.top = (p.clientY - tip.offsetHeight - 14) + 'px';
      el.setAttribute('fill', 'color-mix(in srgb, var(--texto) 6%, transparent)');
    };
    el.addEventListener('pointermove', mostrar);
    el.addEventListener('pointerleave', () => { quitar(); el.setAttribute('fill', 'transparent'); });
  });
}

// ===================== IMPORTAR =====================
let analisisActual = null;
let resultadoHtml = ''; // se conserva aunque la vista se vuelva a pintar
function vistaImportar(app, c) {
  const s = app.servicio;
  const imps = s.repo.lista('imp').sort((a, b) => b.fecha - a.fecha).slice(0, 8);
  c.innerHTML = `
  ${cabecera('Importar extracto')}
  <main class="contenido">
    <section class="tarjeta">
      <h2>1. Descarga el Excel del banco</h2>
      <p class="suave">En la banca digital de IberCaja: <em>Cuentas › Movimientos › Descargar en Excel</em>. Puedes elegir el periodo que quieras; la app ignora lo que ya tenga.</p>
      <h2 style="margin-top:14px">2. Súbelo aquí</h2>
      <div class="botones"><button class="boton primario" data-acc="elegir">${ICONOS.subir} Elegir archivo (.xlsx o .csv)</button></div>
      <p class="tenue">El archivo se lee en este dispositivo. No se sube a ningún sitio.</p>
    </section>
    <div id="resultado-imp"></div>
    ${imps.length ? `<section class="tarjeta"><h2>Últimas importaciones</h2><table class="tabla">
      ${imps.map(i => `<tr><td>${new Date(i.fecha).toLocaleDateString('es-ES')}<br><span class="tenue">${esc(i.archivo)}</span></td><td>${i.desde ? esc(fechaCorta(i.desde)) + ' – ' + esc(fechaCorta(i.hasta)) : ''}</td><td class="der">${i.n} nuevos${i.duplicados ? `<br><span class="tenue">${i.duplicados} ya estaban</span>` : ''}</td></tr>`).join('')}
    </table></section>` : ''}
  </main>`;
  c.querySelector('[data-acc=elegir]').onclick = async () => {
    const f = await elegirArchivo('.xlsx,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv');
    if (f) importarBuffer(app, f.name, await f.arrayBuffer());
  };
  // Arrastrar y soltar en escritorio
  c.ondragover = e => e.preventDefault();
  c.ondrop = async e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) importarBuffer(app, f.name, await f.arrayBuffer());
  };
  if (analisisActual) pintarAnalisis(app, analisisActual);
  else if (resultadoHtml) $('#resultado-imp', c).innerHTML = resultadoHtml;
}

async function importarBuffer(app, nombre, buffer) {
  try {
    analisisActual = await app.servicio.analizarArchivo(nombre, buffer);
    resultadoHtml = '';
    if (!location.hash.startsWith('#/importar')) location.hash = '#/importar';
    else pintarAnalisis(app, analisisActual);
  } catch (e) { aviso(e.message, { error: true }); }
}

function pintarAnalisis(app, a) {
  const d = $('#resultado-imp');
  if (!d) return;
  d.innerHTML = `<section class="tarjeta">
    <h2>${esc(a.nombre)}</h2>
    <table class="tabla">
      ${a.cuenta ? `<tr><td>Cuenta</td><td class="der">${esc(a.cuenta)}</td></tr>` : ''}
      <tr><td>Periodo</td><td class="der">${esc(fechaCorta(a.desde))} – ${esc(fechaCorta(a.hasta))}</td></tr>
      <tr><td>Movimientos en el archivo</td><td class="der">${a.movs.length}</td></tr>
      <tr><td>Nuevos</td><td class="der"><strong>${a.nuevos.length}</strong></td></tr>
      ${a.duplicados ? `<tr><td>Ya importados (se ignoran)</td><td class="der">${a.duplicados}</td></tr>` : ''}
      ${a.saldoFinal != null ? `<tr><td>Saldo final</td><td class="der num">${euros(a.saldoFinal)}</td></tr>` : ''}
      ${a.saldoOk != null ? `<tr><td>Comprobación de saldos</td><td class="der">${a.saldoOk ? '<span class="pos">✓ cuadra</span>' : '<span style="color:var(--aviso)">⚠ no cuadra</span>'}</td></tr>` : ''}
    </table>
    ${a.avisos.length ? `<div class="nota">${a.avisos.map(esc).join('<br>')}</div>` : ''}
    <div class="botones">
      ${a.nuevos.length ? `<button class="boton primario" data-acc="importar">Importar ${a.nuevos.length} nuevos</button>` : '<span class="suave">No hay nada nuevo que importar.</span>'}
      <button class="boton" data-acc="cancelar">Cancelar</button>
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
      pintar(`<section class="tarjeta"><h2>Importados ${r.total}</h2><p>Clasificando con IA los ${sinSug} que no reconozco…</p></section>`);
      try { const ia = await app.servicio.clasificarPendientesConIA(); textoIA = `<p>La IA ha sugerido categoría para ${ia.n} de ${ia.total}.</p>`; }
      catch (err) { textoIA = `<p class="nota">La IA no pudo clasificar: ${esc(err.message)}</p>`; }
    }
    const pend = app.servicio.movs.filter(m => m.estado === 'pendiente').length;
    pintar(`<section class="tarjeta"><h2>Importados ${r.total} movimientos</h2>
      <p><strong>${r.auto}</strong> clasificados automáticamente con reglas seguras.</p>${textoIA}
      ${pend ? `<p>Quedan <strong>${pend}</strong> por revisar en el buzón.</p><div class="botones"><a class="boton primario" href="#/buzon">Ir al buzón</a></div>` : '<p>Todo clasificado.</p>'}
    </section>`);
  });
}

export const vistas = { resumen, buzon: vistaBuzon, movs: vistaMovs, evolucion: vistaEvolucion, importar: vistaImportar, importarBuffer };
