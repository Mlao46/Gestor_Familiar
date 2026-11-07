// Arranque, bloqueo con huella/PIN, navegación y sincronización automática.
import { Repositorio, kv, borrarTodoLocal } from './almacen.js';
import { Servicio } from './servicio.js';
import { Sync } from './sync.js';
import {
  importarClaveDatos, nuevaClaveFamiliar, crearBoveda, abrirBoveda,
  protegerConPin, abrirConPin, protegerConHuella, abrirConHuella, huellaDisponible,
} from './core/cripto.js';
import { esc, $, aviso, hoja, ICONOS } from './ui.js';
import { vistas } from './vistas.js';
import { vistaAjustes } from './ajustes.js';
import { mesesConDatos } from './core/calculos.js';
import { hoyIso, mesDe } from './core/util.js';

export const VERSION = '1.0.0';
const repo = new Repositorio();
const servicio = new Servicio(repo);
const sync = new Sync(repo);

// Estado de la sesión (solo en memoria)
export const app = {
  repo, servicio, sync,
  raw: null,                 // clave familiar en bruto (solo si se abrió con huella, PIN o contraseña)
  filtros: { mes: null, ambito: 'familia', tarjeta: 'todas', ...JSON.parse(localStorage.getItem('filtros') || '{}') },
  guardarFiltros() { localStorage.setItem('filtros', JSON.stringify(this.filtros)); },
  render: () => render(),
  bloquear: () => bloquear(),
  sincronizar: (manual) => sincronizar(manual),
  desbloquearConRaw: raw => desbloquearConRaw(raw),
  proteger: (raw, tipo, pin) => proteger(raw, tipo, pin),
};
window.__app = app; // útil para depurar desde la consola

const raiz = () => $('#app');

// ---------- Arranque ----------
async function arrancar() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  await sync.cargar();
  try {
    if (await sync.completarLoginSiHay()) aviso('Sesión iniciada como ' + sync.email);
  } catch (e) { aviso(e.message, { error: true }); }
  const boveda = await kv.get('boveda');
  if (!boveda) {
    if (sync.conectado && sessionStorage.getItem('tras-login') === 'unirse') return pantallaUnirse();
    return pantallaBienvenida();
  }
  pantallaBloqueo();
}

// ---------- Bienvenida y configuración inicial ----------
function pantallaBienvenida() {
  raiz().innerHTML = `
  <div class="pantalla-central"><div class="caja">
    <img class="logo" src="iconos/icono.svg" alt="">
    <h1>Gestor Familiar</h1>
    <p>Tus cuentas de casa, privadas y cifradas. Subes el Excel del banco y la app hace el resto.</p>
    <div class="opciones">
      <button class="opcion" data-ir="crear"><strong>Empezar de cero</strong><span>Crea la contraseña familiar en este dispositivo.</span></button>
      <button class="opcion" data-ir="unirse"><strong>Unirme a mi familia</strong><span>Alguien ya la usa y te ha invitado.</span></button>
    </div>
  </div></div>`;
  raiz().querySelector('[data-ir=crear]').onclick = pantallaCrear;
  raiz().querySelector('[data-ir=unirse]').onclick = pantallaConfigUnirse;
}

function pantallaCrear() {
  raiz().innerHTML = `
  <div class="pantalla-central"><div class="caja">
    <h1>Contraseña familiar</h1>
    <p>Cifra todos vuestros datos. Solo se pide al configurar un dispositivo nuevo; el resto de veces, huella o PIN.</p>
    <form id="f">
      <label class="campo"><span>Contraseña (mínimo 10 caracteres)</span><input type="password" name="p1" minlength="10" required autocomplete="new-password"></label>
      <label class="campo"><span>Repítela</span><input type="password" name="p2" minlength="10" required autocomplete="new-password"></label>
      <div class="nota">Apúntala en un papel y guárdala en casa. Si la olvidáis y perdéis todos los dispositivos, los datos no se pueden recuperar: ni nosotros ni el servidor pueden leerlos.</div>
      <div class="botones"><button class="boton primario" type="submit">Crear</button><button class="boton" type="button" data-volver>Volver</button></div>
    </form>
  </div></div>`;
  raiz().querySelector('[data-volver]').onclick = pantallaBienvenida;
  raiz().querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('p1') !== f.get('p2')) return aviso('Las contraseñas no coinciden', { error: true });
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Creando…';
    const raw = nuevaClaveFamiliar();
    await kv.set('boveda', await crearBoveda(raw, f.get('p1')));
    await elegirProteccion(raw);
  };
}

function pantallaConfigUnirse() {
  raiz().innerHTML = `
  <div class="pantalla-central"><div class="caja">
    <h1>Unirme a mi familia</h1>
    <p>Pide a quien te invitó la dirección y la clave pública del servidor (están en su app, en Ajustes › Familia).</p>
    <form id="f">
      <label class="campo"><span>URL del proyecto</span><input type="url" name="url" placeholder="https://xxxx.supabase.co" required value="${esc(sync.conf?.url || '')}"></label>
      <label class="campo"><span>Clave pública (anon key)</span><input type="text" name="key" required value="${esc(sync.conf?.anonKey || '')}"></label>
      <div class="botones">
        <button class="boton primario" type="submit" name="p" value="google">Entrar con Google</button>
        <button class="boton" type="submit" name="p" value="azure">Entrar con Microsoft</button>
      </div>
      <div class="botones"><button class="boton" type="button" data-volver>Volver</button></div>
    </form>
  </div></div>`;
  raiz().querySelector('[data-volver]').onclick = pantallaBienvenida;
  raiz().querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await sync.configurar(f.get('url'), f.get('key'));
      sessionStorage.setItem('tras-login', 'unirse');
      await sync.iniciarSesion(e.submitter?.value || 'google');
    } catch (err) { aviso(err.message, { error: true }); }
  };
}

async function pantallaUnirse() {
  raiz().innerHTML = `<div class="pantalla-central"><div class="caja"><p>Buscando tu familia…</p></div></div>`;
  try {
    let fid = await sync.aceptarInvitacion();
    const familias = await sync.misFamilias();
    if (!fid && familias.length) { fid = familias[0].id; await sync.usarFamilia(fid); }
    const fam = familias.find(x => x.id === fid);
    if (!fam) {
      raiz().innerHTML = `<div class="pantalla-central"><div class="caja"><h1>Sin invitación</h1>
        <p>No hay ninguna invitación para <strong>${esc(sync.email)}</strong>. Pide que te inviten desde Ajustes › Familia con este email exacto.</p>
        <div class="botones"><button class="boton" data-reintentar>Reintentar</button><button class="boton" data-salir>Usar otra cuenta</button></div></div></div>`;
      raiz().querySelector('[data-reintentar]').onclick = pantallaUnirse;
      raiz().querySelector('[data-salir]').onclick = async () => { await sync.cerrarSesion(); sessionStorage.removeItem('tras-login'); pantallaBienvenida(); };
      return;
    }
    raiz().innerHTML = `<div class="pantalla-central"><div class="caja">
      <h1>${esc(fam.nombre)}</h1><p>Escribe la contraseña familiar para descifrar los datos en este dispositivo.</p>
      <form id="f"><label class="campo"><span>Contraseña familiar</span><input type="password" name="p" required autocomplete="current-password"></label>
      <div class="botones"><button class="boton primario">Continuar</button></div></form></div></div>`;
    raiz().querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Comprobando…';
      try {
        const raw = await abrirBoveda(fam.boveda, new FormData(e.target).get('p'));
        await kv.set('boveda', fam.boveda);
        sessionStorage.removeItem('tras-login');
        await elegirProteccion(raw);
      } catch (err) { aviso(err.message, { error: true }); btn.disabled = false; btn.textContent = 'Continuar'; }
    };
  } catch (e) {
    aviso(e.message, { error: true });
    pantallaConfigUnirse();
  }
}

// ¿Cómo se desbloquea este dispositivo?
async function elegirProteccion(raw) {
  const hayHuella = huellaDisponible();
  raiz().innerHTML = `
  <div class="pantalla-central"><div class="caja">
    <h1>¿Cómo abrirás la app aquí?</h1>
    <p>Solo afecta a este dispositivo.</p>
    <div class="opciones">
      ${hayHuella ? '<button class="opcion" data-t="huella"><strong>Huella o Face ID</strong><span>Lo más cómodo y seguro.</span></button>' : ''}
      <button class="opcion" data-t="pin"><strong>PIN</strong><span>Un número corto que eliges ahora.</span></button>
      <button class="opcion" data-t="ninguno"><strong>Sin bloqueo</strong><span>Se abre directamente. Solo si nadie más usa este dispositivo.</span></button>
    </div>
  </div></div>`;
  raiz().querySelectorAll('[data-t]').forEach(b => b.onclick = async () => {
    try {
      let pin;
      if (b.dataset.t === 'pin') {
        pin = await pedirPin(true);
        if (!pin) return;
      }
      await proteger(raw, b.dataset.t, pin);
      await desbloquearConRaw(raw);
    } catch (e) { aviso(e.message, { error: true }); }
  });
}

async function proteger(raw, tipo, pin) {
  let prot;
  if (tipo === 'huella') prot = await protegerConHuella(raw, sync.email || 'Familia');
  else if (tipo === 'pin') prot = await protegerConPin(raw, pin);
  else prot = { tipo: 'ninguno', clave: await importarClaveDatos(raw) }; // CryptoKey no exportable guardada en IndexedDB
  await kv.set('desbloqueo', prot);
}

function pedirPin(nuevo = false) {
  return new Promise(ok => {
    const h = hoja(`<h2>${nuevo ? 'Elige un PIN' : 'PIN'}</h2>
      <form><label class="campo"><span>${nuevo ? 'De 4 a 8 cifras' : 'Escribe tu PIN'}</span>
      <input type="password" inputmode="numeric" pattern="[0-9]{4,8}" name="pin" required autocomplete="off"></label>
      ${nuevo ? '<label class="campo"><span>Repítelo</span><input type="password" inputmode="numeric" pattern="[0-9]{4,8}" name="pin2" required autocomplete="off"></label>' : ''}
      <div class="botones"><button class="boton primario">Aceptar</button><button type="button" class="boton" data-cerrar>Cancelar</button></div></form>`,
      { alCerrar: () => ok(null) });
    h.el.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (nuevo && f.get('pin') !== f.get('pin2')) return aviso('Los PIN no coinciden', { error: true });
      const v = f.get('pin'); h.el.parentElement.remove(); ok(v);
    };
  });
}

// ---------- Bloqueo ----------
async function pantallaBloqueo(motivo) {
  const prot = await kv.get('desbloqueo');
  if (prot?.tipo === 'ninguno' && !motivo) return desbloquearConClave(prot.clave);
  raiz().innerHTML = `
  <div class="pantalla-central"><div class="caja">
    <img class="logo" src="iconos/icono.svg" alt="">
    <h1>Gestor Familiar</h1>
    <p>${motivo ? esc(motivo) : 'Bloqueado'}</p>
    <div class="botones" style="justify-content:center">
      ${prot?.tipo === 'huella' ? `<button class="boton primario" data-a="huella">${ICONOS.candado} Desbloquear con huella</button>` : ''}
      ${prot?.tipo === 'pin' ? `<button class="boton primario" data-a="pin">${ICONOS.candado} Escribir PIN</button>` : ''}
      ${prot?.tipo === 'ninguno' ? `<button class="boton primario" data-a="abrir">Abrir</button>` : ''}
    </div>
    <p><button class="boton mini" data-a="pass">Usar la contraseña familiar</button></p>
  </div></div>`;
  const acc = async a => {
    try {
      if (a === 'huella') await desbloquearConRaw(await abrirConHuella(prot));
      else if (a === 'pin') { const pin = await pedirPin(); if (pin) await desbloquearConRaw(await abrirConPin(prot, pin)); }
      else if (a === 'abrir') await desbloquearConClave(prot.clave);
      else if (a === 'pass') await desbloquearConContrasena(prot);
    } catch (e) { aviso(e.name === 'NotAllowedError' ? 'Cancelado' : e.message, { error: true }); }
  };
  raiz().querySelectorAll('[data-a]').forEach(b => b.onclick = () => acc(b.dataset.a));
}

async function desbloquearConContrasena(prot) {
  const boveda = await kv.get('boveda');
  const h = hoja(`<h2>Contraseña familiar</h2><form><label class="campo"><span>Contraseña</span><input type="password" name="p" required autocomplete="current-password"></label>
    <div class="botones"><button class="boton primario">Desbloquear</button><button type="button" class="boton" data-cerrar>Cancelar</button></div></form>`);
  h.el.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const raw = await abrirBoveda(boveda, new FormData(e.target).get('p'));
      h.el.parentElement.remove();
      if (!prot) return elegirProteccion(raw);
      await desbloquearConRaw(raw);
    } catch (err) { aviso(err.message, { error: true }); btn.disabled = false; }
  };
}

async function desbloquearConRaw(raw) {
  app.raw = raw;
  await desbloquearConClave(await importarClaveDatos(raw));
}

async function desbloquearConClave(clave) {
  await repo.abrir(clave);
  await servicio.asegurarBase();
  const meses = mesesConDatos(servicio.movs);
  if (!app.filtros.mes || !meses.includes(app.filtros.mes)) app.filtros.mes = meses[0] || mesDe(hoyIso());
  repo.alCambiar(programarCambios);
  if (!location.hash) location.hash = '#/resumen';
  render();
  await tareasTrasLogin();
  sincronizar();
  if (new URLSearchParams(location.search).has('compartido')) abrirCompartido();
}

function bloquear() {
  repo.cerrar(); app.raw = null; repo.oyentes.clear();
  pantallaBloqueo('Bloqueado');
}

// Al volver de iniciar sesión desde Ajustes: crear o unir familia
async function tareasTrasLogin() {
  const t = sessionStorage.getItem('tras-login');
  if (!t || !sync.conectado) return;
  sessionStorage.removeItem('tras-login');
  try {
    if (sync.familia) return;
    let fid = await sync.aceptarInvitacion();
    if (!fid) {
      const fams = await sync.misFamilias();
      if (fams.length) { fid = fams[0].id; await sync.usarFamilia(fid); }
    }
    if (!fid) {
      fid = await sync.crearFamilia('Familia', await kv.get('boveda'));
      aviso('Familia creada en el servidor. Subiendo tus datos cifrados…');
    } else {
      const fam = (await sync.misFamilias()).find(f => f.id === fid);
      const local = await kv.get('boveda');
      if (fam && JSON.stringify(fam.boveda) !== JSON.stringify(local)) {
        aviso('Esta cuenta pertenece a otra familia con otra contraseña. Revisa Ajustes › Familia.', { error: true });
        await sync.usarFamilia(null);
        return;
      }
    }
    await sincronizar(true);
  } catch (e) { aviso(e.message, { error: true }); }
}

// ---------- Sincronización automática ----------
let tSync = null, tRender = null;
function programarCambios(motivo) {
  clearTimeout(tRender); tRender = setTimeout(render, 30);
  if (motivo !== 'remoto') { clearTimeout(tSync); tSync = setTimeout(() => sincronizar(), 4000); }
}
async function sincronizar(manual = false) {
  if (!sync.conectado || !sync.familia || !repo.clave) { if (manual) aviso('Sincronización no configurada'); return; }
  if (!navigator.onLine) { if (manual) aviso('Sin conexión: se sincronizará al volver'); return; }
  try {
    const r = await sync.sincronizar();
    if (manual && r) aviso(`Sincronizado · ${r.subidos} subidos, ${r.bajados} recibidos`);
  } catch (e) { if (manual) aviso('No se pudo sincronizar: ' + e.message, { error: true }); else console.warn(e); }
}
setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 120000);
addEventListener('online', () => sincronizar());

// Bloqueo automático tras 5 minutos en segundo plano
let ocultoDesde = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { ocultoDesde = Date.now(); return; }
  if (!repo.clave) return;
  const prot = await kv.get('desbloqueo');
  if (prot?.tipo !== 'ninguno' && ocultoDesde && Date.now() - ocultoDesde > 5 * 60000) bloquear();
  else sincronizar();
});

// Archivo compartido desde otra app (Android: Compartir › Gestor Familiar)
async function abrirCompartido() {
  try {
    const cache = await caches.open('compartido');
    const r = await cache.match('archivo');
    history.replaceState(null, '', location.pathname + location.hash);
    if (!r) return;
    const nombre = decodeURIComponent(r.headers.get('x-nombre') || 'extracto.xlsx');
    const buf = await r.arrayBuffer();
    await cache.delete('archivo');
    location.hash = '#/importar';
    setTimeout(() => vistas.importarBuffer(app, nombre, buf), 50);
  } catch (e) { aviso(e.message, { error: true }); }
}

// ---------- Navegación ----------
const PESTANAS = [
  ['resumen', 'Resumen'], ['buzon', 'Buzón'], ['movs', 'Movimientos'], ['evolucion', 'Evolución'], ['ajustes', 'Ajustes'],
];

function ruta() {
  const [r, q] = location.hash.replace(/^#\/?/, '').split('?');
  return { nombre: r || 'resumen', params: new URLSearchParams(q || '') };
}

let ultimaRuta = '';
function render() {
  if (!repo.clave) return;
  const { nombre, params } = ruta();
  const pendientes = servicio.movs.filter(m => m.estado === 'pendiente').length;
  let marco = $('#marco');
  if (!marco) {
    raiz().innerHTML = `<div id="marco"><div id="vista"></div><nav class="barra" aria-label="Secciones"></nav></div>`;
    marco = $('#marco');
  }
  marco.querySelector('.barra').innerHTML = PESTANAS.map(([id, t]) =>
    `<a href="#/${id}" class="${id === nombre || (nombre === 'importar' && id === 'buzon') ? 'activa' : ''}">${ICONOS[id]}<span>${t}</span>${id === 'buzon' && pendientes ? `<b class="insignia">${pendientes > 99 ? '99+' : pendientes}</b>` : ''}</a>`).join('');
  const contenedor = $('#vista');
  const scroll = ultimaRuta === location.hash ? scrollY : 0;
  const v = nombre === 'ajustes' ? vistaAjustes : vistas[nombre] || vistas.resumen;
  // Conservar el foco al re-pintar (p. ej. al escribir en el buscador)
  const foco = document.activeElement?.id;
  const selStart = document.activeElement?.selectionStart;
  v(app, contenedor, params);
  if (foco) { const el = document.getElementById(foco); if (el) { el.focus(); try { el.setSelectionRange(selStart, selStart); } catch { } } }
  if (ultimaRuta !== location.hash) scrollTo(0, 0); else scrollTo(0, scroll);
  ultimaRuta = location.hash;
}
addEventListener('hashchange', render);

// Borrado total de este dispositivo (desde Ajustes)
export async function olvidarDispositivo() {
  await borrarTodoLocal();
  await sync.cerrarSesion().catch(() => {});
  localStorage.clear(); sessionStorage.clear();
  location.replace(location.pathname);
}

arrancar().catch(e => {
  console.error(e);
  raiz().innerHTML = `<div class="pantalla-central"><div class="caja"><h1>Algo ha fallado</h1><p>${esc(e.message)}</p></div></div>`;
});
