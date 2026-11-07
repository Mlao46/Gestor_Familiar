// Pantalla de Ajustes: tarjetas, categorías, reglas, IA, familia y sincronización, seguridad y datos.
import { esc, $, $$, aviso, hoja, confirmar, opcionesCategorias, opcionesTipo, opcionesAmbito, descargar, elegirArchivo, pedirTexto, ICONOS } from './ui.js';
import { kv } from './almacen.js';
import { AMBITOS, TIPOS } from './core/categorias.js';
import { mediasPorCategoria } from './core/calculos.js';
import { euros, uid, norm, hoyIso, mesDe } from './core/util.js';
import { abrirBoveda, crearBoveda, cifrarCopia, descifrarCopia, huellaDisponible } from './core/cripto.js';
import { MODELO_POR_DEFECTO } from './ia.js';
import { olvidarDispositivo, VERSION } from './app.js';

const abiertas = new Set();
let filtroReglas = '';

export function vistaAjustes(app, c, params) {
  if (params.get('abrir')) { abiertas.add(params.get('abrir')); history.replaceState(null, '', '#/ajustes'); }
  const s = app.servicio;
  const sec = (id, titulo, html) => `<details class="seccion" data-id="${id}" ${abiertas.has(id) ? 'open' : ''}><summary>${titulo}</summary><div class="dentro">${html}</div></details>`;
  c.innerHTML = `
  <header class="cabecera"><h1>Ajustes</h1><button class="boton mini" data-acc="bloquear">${ICONOS.candado} Bloquear</button></header>
  <main class="contenido">
    ${sec('tarjetas', 'Tarjetas', htmlTarjetas(app))}
    ${sec('categorias', 'Categorías y presupuestos', htmlCategorias(app))}
    ${sec('reglas', `Reglas de clasificación <span class="tenue">${s.reglas.length}</span>`, htmlReglas(app))}
    ${sec('ia', 'Inteligencia artificial (Claude)', htmlIA(app))}
    ${sec('familia', 'Familia y sincronización', htmlFamilia(app))}
    ${sec('seguridad', 'Seguridad', '<div id="seg">Cargando…</div>')}
    ${sec('datos', 'Copias de seguridad y datos', htmlDatos(app))}
    <p class="tenue" style="text-align:center">Gestor Familiar ${VERSION} · datos cifrados de extremo a extremo</p>
  </main>`;
  $$('details.seccion', c).forEach(d => d.ontoggle = () => { d.open ? abiertas.add(d.dataset.id) : abiertas.delete(d.dataset.id); });
  $('[data-acc=bloquear]', c).onclick = () => app.bloquear();
  enlazarTarjetas(app, c); enlazarCategorias(app, c); enlazarReglas(app, c); enlazarIA(app, c); enlazarFamilia(app, c); pintarSeguridad(app, c); enlazarDatos(app, c);
}

// ---------- Tarjetas ----------
function htmlTarjetas(app) {
  const ts = app.servicio.tarjetas.sort((a, b) => a.id.localeCompare(b.id));
  const usos = {};
  for (const m of app.servicio.movs) if (m.tarjeta) usos[m.tarjeta] = (usos[m.tarjeta] || 0) + 1;
  return `<p class="suave">Ponle nombre a cada tarjeta para filtrar los gastos de cada uno, aunque salgan de la misma cuenta. Si una tarjeta es del trabajo, asígnale el ámbito y sus gastos irán aparte.</p>
  <table class="tabla"><thead><tr><th>Tarjeta</th><th>Nombre</th><th>Ámbito</th></tr></thead><tbody>
  ${ts.map(t => `<tr data-t="${esc(t.id)}"><td class="num">…${esc(t.id.slice(2))}<br><span class="tenue">${usos[t.id.slice(2)] || 0} mov.</span></td>
    <td><input type="text" name="nombre" value="${esc(t.nombre)}" aria-label="Nombre de la tarjeta"></td>
    <td><select name="ambito" aria-label="Ámbito"><option value="">Familia</option>${Object.entries(AMBITOS).filter(([k]) => k !== 'familia').map(([k, v]) => `<option value="${k}" ${t.ambito === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}
  </tbody></table>
  <p class="tenue">Las tarjetas aparecen solas al importar el extracto.</p>`;
}
function enlazarTarjetas(app, c) {
  $$('[data-t]', c).forEach(tr => {
    const guardar = async () => {
      const t = app.servicio.repo.obtener('tarjeta', tr.dataset.t);
      const amb = $('[name=ambito]', tr).value;
      await app.servicio.repo.guardar('tarjeta', { ...t, nombre: $('[name=nombre]', tr).value.trim() || t.nombre, ambito: amb }, { silencioso: true });
      if (amb !== (t.ambito || '')) {
        // Recolocar pendientes de esa tarjeta
        const movs = app.servicio.movs.filter(m => m.tarjeta === t.id.slice(2) && m.estado === 'pendiente').map(m => ({ ...m, ambito: amb || 'familia' }));
        if (movs.length) await app.servicio.repo.guardar('mov', movs, { silencioso: true });
      }
      aviso('Tarjeta guardada');
    };
    $('[name=nombre]', tr).onchange = guardar;
    $('[name=ambito]', tr).onchange = guardar;
  });
}

// ---------- Categorías ----------
function htmlCategorias(app) {
  const s = app.servicio;
  const medias = mediasPorCategoria(s.movs.filter(m => m.ambito === 'familia' || !m.ambito), mesDe(hoyIso()), 6);
  const grupos = new Map();
  for (const ct of s.cats) { if (!grupos.has(ct.grupo)) grupos.set(ct.grupo, []); grupos.get(ct.grupo).push(ct); }
  return `<p class="suave">Cambiar el nombre no afecta a los movimientos ya clasificados. Presupuesto = euros al mes (0 = sin presupuesto).</p>
  <table class="tabla"><thead><tr><th>Categoría</th><th class="der">Media 6 m</th><th class="der">Presupuesto</th><th></th></tr></thead><tbody>
  ${[...grupos].map(([g, l]) => `<tr><td colspan="4" style="font-weight:700;padding-top:14px">${esc(g)}</td></tr>` + l.map(ct => `
    <tr data-c="${esc(ct.id)}"><td><input type="text" name="nombre" value="${esc(ct.nombre)}" aria-label="Nombre"></td>
    <td class="der num tenue">${medias[ct.id] ? euros(medias[ct.id]) : '—'}</td>
    <td class="der" style="width:110px">${ct.tipo === 'ingreso' ? '' : `<input type="number" name="pres" min="0" step="10" value="${ct.presupuesto || ''}" placeholder="0" aria-label="Presupuesto" style="text-align:right">`}</td>
    <td><button class="boton mini icono" data-ocultar title="Ocultar categoría" aria-label="Ocultar">✕</button></td></tr>`).join('')).join('')}
  </tbody></table>
  <div class="botones"><button class="boton" data-acc="nueva-cat">${ICONOS.mas} Nueva categoría</button><button class="boton" data-acc="sugerir">Presupuestos = media de 6 meses</button>
  ${s.catsTodas.some(x => x.oculta) ? '<button class="boton" data-acc="mostrar">Mostrar ocultas</button>' : ''}</div>`;
}
function enlazarCategorias(app, c) {
  const s = app.servicio;
  $$('[data-c]', c).forEach(tr => {
    const ct = () => s.repo.obtener('cat', tr.dataset.c);
    $('[name=nombre]', tr).onchange = e => s.repo.guardar('cat', { ...ct(), nombre: e.target.value.trim() || ct().nombre }, { silencioso: true });
    const p = $('[name=pres]', tr);
    if (p) p.onchange = () => s.repo.guardar('cat', { ...ct(), presupuesto: Math.max(0, Number(p.value) || 0) }, { silencioso: true });
    $('[data-ocultar]', tr).onclick = async () => {
      const usada = s.movs.filter(m => m.cat === tr.dataset.c).length;
      if (await confirmar(`¿Ocultar «${ct().nombre}»?${usada ? ` Sus ${usada} movimientos la conservan.` : ''}`, { si: 'Ocultar' })) await s.repo.guardar('cat', { ...ct(), oculta: true });
    };
  });
  c.querySelector('[data-acc=mostrar]')?.addEventListener('click', () => s.repo.guardar('cat', s.catsTodas.filter(x => x.oculta).map(x => ({ ...x, oculta: false }))));
  c.querySelector('[data-acc=sugerir]').onclick = async () => {
    const medias = mediasPorCategoria(s.movs.filter(m => m.ambito === 'familia' || !m.ambito), mesDe(hoyIso()), 6);
    const cambios = s.cats.filter(x => x.tipo === 'gasto' && medias[x.id] > 0).map(x => ({ ...x, presupuesto: Math.ceil(medias[x.id] / 10) * 10 }));
    if (!cambios.length) return aviso('Aún no hay datos suficientes');
    if (await confirmar(`Se pondrá como presupuesto la media de los últimos 6 meses (redondeada) en ${cambios.length} categorías.`, { si: 'Aplicar' })) {
      await s.repo.guardar('cat', cambios); aviso('Presupuestos actualizados');
    }
  };
  c.querySelector('[data-acc=nueva-cat]').onclick = () => {
    const grupos = [...new Set(s.cats.map(x => x.grupo))];
    const h = hoja(`<h2>Nueva categoría</h2><form>
      <label class="campo"><span>Grupo</span><input type="text" name="grupo" list="grupos" required><datalist id="grupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
      <label class="campo"><span>Nombre</span><input type="text" name="nombre" required></label>
      <label class="campo"><span>Tipo</span><select name="tipo"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></label>
      <div class="botones"><button class="boton primario">Crear</button><button type="button" class="boton" data-cerrar>Cancelar</button></div></form>`);
    $('form', h.el).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      await s.repo.guardar('cat', { id: uid('c_'), grupo: f.grupo.value.trim(), nombre: f.nombre.value.trim(), tipo: f.tipo.value, presupuesto: 0, orden: 900 });
      h.cerrar();
    };
  };
}

// ---------- Reglas ----------
function htmlReglas(app) {
  const s = app.servicio;
  const cats = Object.fromEntries(s.catsTodas.map(x => [x.id, x]));
  const q = norm(filtroReglas);
  const lista = s.reglas.filter(r => !q || norm(r.patron).includes(q) || norm(cats[r.cat]?.nombre).includes(q))
    .sort((a, b) => ({ manual: 0, aprendida: 1, ia: 2 }[a.origen] - { manual: 0, aprendida: 1, ia: 2 }[b.origen]) || (b.usos || 0) - (a.usos || 0) || a.patron.localeCompare(b.patron));
  const nombreOrigen = { manual: 'tuya', aprendida: 'aprendida', ia: 'IA' };
  return `<p class="suave">Si la descripción del banco contiene el texto, se aplica la regla. Prioridad: las tuyas, luego las aprendidas y por último las de la IA. Las aprendidas se confirman solas cuando las has usado 2 veces.</p>
  <div class="fila"><input type="search" id="buscar-reglas" placeholder="Buscar regla" value="${esc(filtroReglas)}"><button class="boton" data-acc="nueva-regla" style="flex:0 0 auto">${ICONOS.mas} Nueva</button></div>
  <table class="tabla" style="margin-top:8px"><thead><tr><th>Si contiene</th><th>Entonces</th><th class="der">Usos</th></tr></thead><tbody>
  ${lista.slice(0, 300).map(r => `<tr data-r="${esc(r.id)}" style="cursor:pointer"><td><strong>${esc(r.patron)}</strong>${r.signo ? ` <span class="tenue">${r.signo === '-' ? 'cargos' : 'abonos'}</span>` : ''}<br><span class="etiqueta ${r.origen === 'ia' ? 'ia' : ''}">${nombreOrigen[r.origen] || r.origen}</span></td>
    <td>${r.tipo === 'traspaso' ? 'Traspaso' : esc(cats[r.cat] ? cats[r.cat].grupo + ' › ' + cats[r.cat].nombre : 'Sin categoría')}${r.tipo === 'reembolso' ? ' <span class="etiqueta tipo-reembolso">reembolso</span>' : ''}${r.ambito ? ` <span class="etiqueta">${esc(AMBITOS[r.ambito])}</span>` : ''}</td>
    <td class="der">${r.usos || 0}</td></tr>`).join('')}
  </tbody></table>${lista.length > 300 ? `<p class="tenue">Mostrando 300 de ${lista.length}. Usa el buscador.</p>` : ''}
  <div class="botones"><button class="boton" data-acc="reaplicar">Volver a aplicar reglas a los pendientes</button></div>`;
}
function enlazarReglas(app, c) {
  const s = app.servicio;
  const b = $('#buscar-reglas', c);
  let t; b.oninput = () => { clearTimeout(t); t = setTimeout(() => { filtroReglas = b.value; app.render(); }, 250); };
  $$('[data-r]', c).forEach(tr => tr.onclick = () => editarRegla(app, s.repo.obtener('regla', tr.dataset.r)));
  c.querySelector('[data-acc=nueva-regla]').onclick = () => editarRegla(app, null);
  c.querySelector('[data-acc=reaplicar]').onclick = async () => { const n = await s.reclasificarPendientes(); aviso(n ? `${n} pendientes reclasificados` : 'No ha cambiado nada'); };
}
function editarRegla(app, r) {
  const s = app.servicio;
  const nueva = !r;
  r ||= { patron: '', signo: '', tipo: 'gasto', cat: '', ambito: '', origen: 'manual', usos: 0 };
  const h = hoja(`<h2>${nueva ? 'Nueva regla' : 'Editar regla'}</h2><form>
    <label class="campo"><span>Si la descripción contiene</span><input type="text" name="patron" value="${esc(r.patron)}" required placeholder="p. ej. MERCADONA"></label>
    <label class="campo"><span>Aplicar a</span><select name="signo"><option value="">Cargos y abonos</option><option value="-" ${r.signo === '-' ? 'selected' : ''}>Solo cargos (dinero que sale)</option><option value="+" ${r.signo === '+' ? 'selected' : ''}>Solo abonos (dinero que entra)</option></select></label>
    <div class="fila"><label class="campo"><span>Tipo</span><select name="tipo">${opcionesTipo(r.tipo)}</select></label>
    <label class="campo"><span>Ámbito</span><select name="ambito"><option value="">Según tarjeta/categoría</option>${Object.entries(AMBITOS).map(([k, v]) => `<option value="${k}" ${r.ambito === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <label class="campo"><span>Categoría</span><select name="cat">${opcionesCategorias(s.cats, r.cat, { tipo: r.tipo })}</select></label>
    <p class="tenue" id="coinciden"></p>
    <div class="botones"><button class="boton primario">Guardar</button><button type="button" class="boton" data-cerrar>Cancelar</button>${nueva ? '' : '<button type="button" class="boton peligro" data-borrar style="margin-left:auto">Borrar</button>'}</div></form>`);
  const f = $('form', h.el);
  const contar = () => {
    const p = norm(f.patron.value);
    const n = p.length >= 2 ? s.movs.filter(m => norm(m.desc).includes(p) && (!f.signo.value || (f.signo.value === '-') === (m.importe < 0))).length : 0;
    $('#coinciden', h.el).textContent = p.length >= 2 ? `Coincide con ${n} movimientos que ya tienes.` : '';
  };
  f.patron.oninput = contar; f.signo.onchange = contar; contar();
  f.tipo.onchange = () => { f.cat.innerHTML = opcionesCategorias(s.cats, f.cat.value, { tipo: f.tipo.value }); };
  f.onsubmit = async e => {
    e.preventDefault();
    await s.repo.guardar('regla', { ...r, id: r.id || uid('r_'), patron: norm(f.patron.value), signo: f.signo.value, tipo: f.tipo.value, cat: f.cat.value || null, ambito: f.ambito.value, origen: 'manual', creada: r.creada || Date.now() });
    const n = await s.reclasificarPendientes();
    aviso(n ? `Regla guardada · ${n} pendientes reclasificados` : 'Regla guardada'); h.cerrar();
  };
  $('[data-borrar]', h.el)?.addEventListener('click', async () => { await s.repo.borrar('regla', r.id); h.cerrar(); });
}

// ---------- IA ----------
function htmlIA(app) {
  const a = app.servicio.ajustes;
  return `<p class="suave">Para los movimientos que las reglas no reconocen, Claude sugiere la categoría. Cada sugerencia que confirmas se convierte en regla, así que la IA se usa cada vez menos.</p>
  <div class="nota"><strong>Qué se envía:</strong> solo el tipo de operación, el nombre del comercio, si es cargo o abono y el importe redondeado. En los Bizum se quita el nombre de la persona. <strong>Nunca</strong> se envían saldos, número de cuenta ni tarjetas. Anthropic no usa los datos de la API para entrenar sus modelos.</div>
  <form id="f-ia">
    <label class="interruptor"><span>Usar IA para clasificar</span><input type="checkbox" name="iaActiva" ${a.iaActiva ? 'checked' : ''}></label>
    <label class="campo"><span>Clave de la API de Claude</span><input type="password" name="apiKey" value="${esc(a.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
    <p class="tenue">Créala en console.anthropic.com › API Keys y pon un límite de gasto mensual (por ejemplo 2 €). Se guarda cifrada con el resto de datos y la comparte toda la familia.</p>
    <label class="campo"><span>Modelo</span><input type="text" name="modelo" value="${esc(a.modelo)}" placeholder="${MODELO_POR_DEFECTO}"></label>
    <label class="campo"><span>Contexto para la IA (opcional)</span><textarea name="contexto" rows="3" placeholder="p. ej. Somos 4 en casa, dos niños. Supeco es un supermercado. Atida es farmacia online.">${esc(a.contexto)}</textarea></label>
    <label class="interruptor"><span>Dar por buenas las sugerencias de la IA sin revisarlas</span><input type="checkbox" name="iaAutoConfirmar" ${a.iaAutoConfirmar ? 'checked' : ''}></label>
    <label class="interruptor"><span>Confirmar solos los movimientos con reglas seguras</span><input type="checkbox" name="autoConfirmar" ${a.autoConfirmar ? 'checked' : ''}></label>
    <div class="botones"><button class="boton primario">Guardar</button><button class="boton" type="button" data-acc="probar-ia">Probar conexión</button></div>
  </form>`;
}
function enlazarIA(app, c) {
  const f = $('#f-ia', c);
  const leer = () => ({ iaActiva: f.iaActiva.checked, apiKey: f.apiKey.value.trim(), modelo: f.modelo.value.trim() || MODELO_POR_DEFECTO, contexto: f.contexto.value.trim(), iaAutoConfirmar: f.iaAutoConfirmar.checked, autoConfirmar: f.autoConfirmar.checked });
  f.onsubmit = async e => { e.preventDefault(); await app.servicio.guardarAjustes(leer()); aviso('Guardado'); };
  $('[data-acc=probar-ia]', c).onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const { clasificarConIA } = await import('./ia.js');
      const r = await clasificarConIA([{ desc: 'MERCADONA AV. EUROPA', tipoOp: 'TARJETA VISA', importe: -45.3 }], app.servicio.cats, leer());
      aviso(r[0]?.cat ? `Funciona: «Mercadona» → ${app.servicio.repo.obtener('cat', r[0].cat)?.nombre}` : 'Responde, pero sin categoría');
    } catch (err) { aviso(err.message, { error: true }); }
    b.disabled = false;
  };
}

// ---------- Familia y sincronización ----------
function htmlFamilia(app) {
  const y = app.sync;
  if (!y.configurado) return `<p class="suave">Ahora los datos están solo en este dispositivo. Para compartirlos con tu familia y verlos en el móvil y el ordenador, conecta un proyecto gratuito de Supabase (la guía está en el README).</p>${formConf(y)}`;
  if (!y.conectado) return `<p class="suave">Servidor configurado. Inicia sesión para sincronizar.</p>
    <div class="botones"><button class="boton primario" data-login="google">Entrar con Google</button><button class="boton" data-login="azure">Entrar con Microsoft</button></div>
    <details style="margin-top:12px"><summary class="tenue">Cambiar servidor</summary>${formConf(y)}</details>`;
  return `<table class="tabla">
    <tr><td>Sesión</td><td class="der">${esc(y.email || '—')}</td></tr>
    <tr><td>Familia</td><td class="der">${y.familia ? '<span class="pos">conectada</span>' : '<span style="color:var(--aviso)">sin familia</span>'}</td></tr>
    <tr><td>Última sincronización</td><td class="der" id="ultima-sync">—</td></tr>
  </table>
  <div class="botones">
    ${y.familia ? `<button class="boton primario" data-acc="sync">${ICONOS.sync} Sincronizar ahora</button>` : '<button class="boton primario" data-acc="crear-fam">Crear o unir familia</button>'}
    <button class="boton" data-acc="salir">Cerrar sesión</button>
  </div>
  ${y.familia ? `<h3 style="font-size:14px;margin:18px 0 6px">Miembros</h3><div id="miembros" class="tenue">Cargando…</div>
  <form id="f-inv" class="fila" style="margin-top:8px"><input type="email" name="email" placeholder="email de Google o Microsoft de tu mujer" required><button class="boton" style="flex:0 0 auto">Invitar</button></form>
  <p class="tenue">Para que se una: que instale la app, pulse «Unirme a mi familia», escriba estos datos y entre con ese email. Después le pedirá la contraseña familiar.</p>
  <div class="nota">URL: <code>${esc(y.conf.url)}</code><br>Clave pública: <code style="word-break:break-all">${esc(y.conf.anonKey)}</code></div>` : ''}`;
}
function formConf(y) {
  return `<form id="f-conf">
    <label class="campo"><span>URL del proyecto</span><input type="url" name="url" placeholder="https://xxxx.supabase.co" value="${esc(y.conf?.url || '')}" required></label>
    <label class="campo"><span>Clave pública (anon key)</span><input type="text" name="key" value="${esc(y.conf?.anonKey || '')}" required></label>
    <div class="botones"><button class="boton primario">Guardar y entrar con Google</button></div></form>`;
}
function enlazarFamilia(app, c) {
  const y = app.sync;
  $('#f-conf', c)?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await y.configurar(e.target.url.value, e.target.key.value); sessionStorage.setItem('tras-login', 'conectar'); await y.iniciarSesion('google'); }
    catch (err) { aviso(err.message, { error: true }); }
  });
  $$('[data-login]', c).forEach(b => b.onclick = () => { sessionStorage.setItem('tras-login', 'conectar'); y.iniciarSesion(b.dataset.login); });
  c.querySelector('[data-acc=sync]')?.addEventListener('click', () => app.sincronizar(true));
  c.querySelector('[data-acc=crear-fam]')?.addEventListener('click', async () => {
    try {
      let fid = await y.aceptarInvitacion();
      const fams = await y.misFamilias();
      if (!fid && fams.length) { fid = fams[0].id; }
      const local = await kv.get('boveda');
      if (fid) {
        const fam = fams.find(f => f.id === fid) || (await y.misFamilias()).find(f => f.id === fid);
        if (fam && JSON.stringify(fam.boveda) !== JSON.stringify(local)) return aviso('Esa familia tiene otra contraseña familiar. Para unirte, borra los datos de este dispositivo y usa «Unirme a mi familia».', { error: true });
        await y.usarFamilia(fid);
      } else await y.crearFamilia('Familia', local);
      await app.sincronizar(true); app.render();
    } catch (err) { aviso(err.message, { error: true }); }
  });
  c.querySelector('[data-acc=salir]')?.addEventListener('click', async () => {
    if (await confirmar('¿Cerrar sesión? Los datos de este dispositivo se mantienen.', { si: 'Cerrar sesión' })) { await y.cerrarSesion(); app.render(); }
  });
  kv.get('sync-ultima').then(t => { const el = $('#ultima-sync', c); if (el && t) el.textContent = new Date(t).toLocaleString('es-ES'); });
  const mi = $('#miembros', c);
  if (mi) y.miembros().then(l => { mi.innerHTML = (l || []).map(x => `${esc(x.email)}${x.rol === 'admin' ? ' <span class="etiqueta">admin</span>' : ''}`).join('<br>') || '—'; }).catch(e => { mi.textContent = e.message; });
  $('#f-inv', c)?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await y.invitar(e.target.email.value); aviso('Invitación creada'); e.target.reset(); } catch (err) { aviso(err.message, { error: true }); }
  });
}

// ---------- Seguridad ----------
async function pintarSeguridad(app, c) {
  const prot = await kv.get('desbloqueo');
  const el = $('#seg', c); if (!el) return;
  const nombre = { huella: 'Huella / Face ID', pin: 'PIN', ninguno: 'Sin bloqueo' }[prot?.tipo] || '—';
  el.innerHTML = `<table class="tabla"><tr><td>Este dispositivo se abre con</td><td class="der"><strong>${nombre}</strong></td></tr></table>
    <div class="botones">
      ${huellaDisponible() && prot?.tipo !== 'huella' ? '<button class="boton" data-p="huella">Usar huella / Face ID</button>' : ''}
      ${prot?.tipo !== 'pin' ? '<button class="boton" data-p="pin">Usar PIN</button>' : '<button class="boton" data-p="pin">Cambiar PIN</button>'}
      ${prot?.tipo !== 'ninguno' ? '<button class="boton" data-p="ninguno">Quitar bloqueo</button>' : ''}
    </div>
    <div class="botones"><button class="boton" data-acc="cambiar-pass">Cambiar contraseña familiar</button></div>
    <p class="tenue">La app se bloquea sola tras 5 minutos en segundo plano.</p>`;
  $$('[data-p]', el).forEach(b => b.onclick = async () => {
    try {
      const raw = app.raw || await pedirRaw();
      if (!raw) return;
      let pin;
      if (b.dataset.p === 'pin') {
        pin = await pedirTexto('Nuevo PIN', { etiqueta: 'De 4 a 8 cifras', patron: '[0-9]{4,8}', modo: 'numeric' });
        if (!pin || !/^\d{4,8}$/.test(pin)) return aviso('PIN no válido', { error: true });
      }
      await app.proteger(raw, b.dataset.p, pin);
      app.raw = raw;
      aviso('Protección cambiada'); pintarSeguridad(app, c);
    } catch (e) { aviso(e.name === 'NotAllowedError' ? 'Cancelado' : e.message, { error: true }); }
  });
  $('[data-acc=cambiar-pass]', el).onclick = () => {
    const h = hoja(`<h2>Cambiar contraseña familiar</h2><form>
      <label class="campo"><span>Contraseña actual</span><input type="password" name="a" required autocomplete="current-password"></label>
      <label class="campo"><span>Nueva (mínimo 10)</span><input type="password" name="n1" minlength="10" required autocomplete="new-password"></label>
      <label class="campo"><span>Repite la nueva</span><input type="password" name="n2" minlength="10" required autocomplete="new-password"></label>
      <p class="tenue">Los datos no cambian: solo cambia la contraseña que protege la clave. Los demás dispositivos siguen funcionando con su huella o PIN.</p>
      <div class="botones"><button class="boton primario">Cambiar</button><button type="button" class="boton" data-cerrar>Cancelar</button></div></form>`);
    $('form', h.el).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      if (f.n1.value !== f.n2.value) return aviso('No coinciden', { error: true });
      try {
        const raw = await abrirBoveda(await kv.get('boveda'), f.a.value);
        const nueva = await crearBoveda(raw, f.n1.value);
        if (app.sync.conectado && app.sync.familia) await app.sync.actualizarBoveda(nueva);
        await kv.set('boveda', nueva);
        aviso('Contraseña cambiada'); h.cerrar();
      } catch (err) { aviso(err.message, { error: true }); }
    };
  };
}

function pedirRaw() {
  return new Promise(ok => {
    const h = hoja(`<h2>Contraseña familiar</h2><p class="suave">Hace falta para cambiar la protección de este dispositivo.</p><form><label class="campo"><span>Contraseña</span><input type="password" name="p" required></label>
      <div class="botones"><button class="boton primario">Continuar</button><button type="button" class="boton" data-cerrar>Cancelar</button></div></form>`, { alCerrar: () => ok(null) });
    $('form', h.el).onsubmit = async e => {
      e.preventDefault();
      try { const raw = await abrirBoveda(await kv.get('boveda'), e.target.p.value); h.el.parentElement.remove(); ok(raw); }
      catch (err) { aviso(err.message, { error: true }); }
    };
  });
}

// ---------- Datos ----------
function htmlDatos(app) {
  const s = app.servicio;
  return `<table class="tabla">
    <tr><td>Movimientos</td><td class="der">${s.movs.length}</td></tr>
    <tr><td>Reglas</td><td class="der">${s.reglas.length}</td></tr>
    <tr><td>Categorías</td><td class="der">${s.cats.length}</td></tr>
  </table>
  <div class="botones">
    <button class="boton" data-acc="exportar">Descargar copia cifrada</button>
    <button class="boton" data-acc="restaurar">Restaurar copia</button>
    <button class="boton" data-acc="csv">Exportar a CSV (Excel)</button>
  </div>
  <div class="botones"><button class="boton" data-acc="migrar">Importar datos de la app antigua</button></div>
  <p class="tenue">La copia cifrada usa tu contraseña familiar. Guárdala donde quieras (Drive, correo…): sin la contraseña no se puede leer.</p>
  <div class="botones"><button class="boton peligro" data-acc="olvidar">Borrar todos los datos de este dispositivo</button></div>`;
}
function enlazarDatos(app, c) {
  const s = app.servicio;
  $('[data-acc=exportar]', c).onclick = async () => {
    const p = await pedirTexto('Copia cifrada', { etiqueta: 'Contraseña familiar' });
    if (!p) return;
    try {
      await abrirBoveda(await kv.get('boveda'), p); // comprobar que es la correcta
      const sobre = await cifrarCopia(s.repo.exportar(), p);
      descargar(`gestor-familiar-${hoyIso()}.gfam`, JSON.stringify(sobre));
    } catch (e) { aviso(e.message, { error: true }); }
  };
  $('[data-acc=restaurar]', c).onclick = async () => {
    const f = await elegirArchivo('.gfam,.json'); if (!f) return;
    const p = await pedirTexto('Restaurar copia', { etiqueta: 'Contraseña con la que se cifró' }); if (!p) return;
    try {
      const datos = await descifrarCopia(JSON.parse(await f.text()), p);
      if (await confirmar(`Se añadirán o actualizarán ${datos.datos.mov?.length || 0} movimientos y ${datos.datos.regla?.length || 0} reglas.`, { si: 'Restaurar' })) {
        await s.restaurarDatos(datos); aviso('Copia restaurada');
      }
    } catch (e) { aviso(e.message, { error: true }); }
  };
  $('[data-acc=csv]', c).onclick = () => {
    const cats = Object.fromEntries(s.catsTodas.map(x => [x.id, x]));
    const filas = [['Fecha', 'Descripción', 'Importe', 'Tipo', 'Grupo', 'Categoría', 'Ámbito', 'Tarjeta', 'Nota']];
    for (const m of s.movs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      filas.push([m.fecha, m.desc, String(m.importe).replace('.', ','), TIPOS[m.tipo], cats[m.cat]?.grupo || '', cats[m.cat]?.nombre || '', AMBITOS[m.ambito] || '', m.tarjeta ? s.nombreTarjeta(m.tarjeta) : '', m.nota || '']);
    }
    const csv = '﻿' + filas.map(f => f.map(v => /[;"\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
    descargar(`movimientos-${hoyIso()}.csv`, csv, 'text/csv;charset=utf-8');
  };
  $('[data-acc=migrar]', c).onclick = async () => {
    const f = await elegirArchivo('.json'); if (!f) return;
    try {
      const r = await s.importarMigracion(JSON.parse(await f.text()));
      const ultimo = s.movs.map(m => m.fecha).sort().pop();
      if (ultimo) { app.filtros.mes = mesDe(ultimo); app.guardarFiltros(); }
      aviso(`${r.movs} movimientos importados · ${r.reglas} reglas aprendidas${r.omitidos ? ` · ${r.omitidos} ya estaban` : ''}`, { ms: 6000 });
    } catch (e) { aviso(e.message, { error: true }); }
  };
  $('[data-acc=olvidar]', c).onclick = async () => {
    if (await confirmar('Se borrarán los datos y la clave de ESTE dispositivo. Si no tienes sincronización ni copia, se perderán. ¿Seguro?', { si: 'Borrar todo', peligro: true })) await olvidarDispositivo();
  };
}
