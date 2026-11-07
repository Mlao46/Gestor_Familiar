// Ayudas de interfaz: escapado, avisos, hojas modales, selectores.
import { TIPOS, AMBITOS } from './core/categorias.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function aviso(texto, { error = false, ms = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.textContent = texto;
  $('#avisos').append(el);
  setTimeout(() => el.remove(), error ? ms * 1.8 : ms);
}

export function hoja(html, { alCerrar } = {}) {
  const velo = document.createElement('div');
  velo.className = 'velo';
  velo.innerHTML = `<div class="hoja" role="dialog" aria-modal="true">${html}</div>`;
  const cerrar = () => { velo.remove(); document.removeEventListener('keydown', tecla); alCerrar?.(); };
  const tecla = e => { if (e.key === 'Escape') cerrar(); };
  velo.addEventListener('click', e => { if (e.target === velo || e.target.closest('[data-cerrar]')) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(velo);
  velo.querySelector('input, select, button')?.focus({ preventScroll: true });
  return { el: velo.firstElementChild, cerrar };
}

export function confirmar(texto, { si = 'Sí', no = 'Cancelar', peligro = false } = {}) {
  return new Promise(ok => {
    const h = hoja(`<p>${esc(texto)}</p><div class="botones"><button class="boton ${peligro ? 'peligro' : 'primario'}" data-si>${esc(si)}</button><button class="boton" data-cerrar>${esc(no)}</button></div>`, { alCerrar: () => ok(false) });
    h.el.querySelector('[data-si]').onclick = () => { ok(true); h.el.parentElement.remove(); };
  });
}

export function opcionesCategorias(cats, seleccion, { vacia = 'Sin categoría', tipo } = {}) {
  const grupos = new Map();
  for (const c of cats) {
    if (tipo === 'ingreso' && c.tipo !== 'ingreso') continue;
    if ((tipo === 'gasto' || tipo === 'reembolso') && c.tipo === 'ingreso') continue;
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
    grupos.get(c.grupo).push(c);
  }
  let h = `<option value="">${esc(vacia)}</option>`;
  for (const [g, lista] of grupos) {
    h += `<optgroup label="${esc(g)}">` + lista.map(c => `<option value="${esc(c.id)}"${c.id === seleccion ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('') + '</optgroup>';
  }
  return h;
}

export const opcionesTipo = sel => Object.entries(TIPOS).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join('');
export const opcionesAmbito = sel => Object.entries(AMBITOS).map(([k, v]) => `<option value="${k}"${k === (sel || 'familia') ? ' selected' : ''}>${v}</option>`).join('');

export function fechaCorta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
export function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function descargar(nombre, contenido, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function elegirArchivo(accept) {
  return new Promise(ok => {
    const i = Object.assign(document.createElement('input'), { type: 'file', accept });
    i.onchange = () => ok(i.files[0] || null);
    i.click();
  });
}

export const ICONOS = {
  resumen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  buzon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></svg>',
  movs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  evolucion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  subir: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>',
  mas: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  izq: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  der: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  sync: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v4h-4M6 22v-4h4"/></svg>',
  candado: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
};

// Pide un texto en una hoja (sustituye a prompt(), que muestra las contraseñas en claro)
export function pedirTexto(titulo, { tipo = 'password', etiqueta = '', patron = '', modo = '' } = {}) {
  return new Promise(ok => {
    const h = hoja(`<h2>${esc(titulo)}</h2><form><label class="campo"><span>${esc(etiqueta)}</span>
      <input type="${tipo}" name="v" required autocomplete="off" ${patron ? `pattern="${patron}"` : ''} ${modo ? `inputmode="${modo}"` : ''}></label>
      <div class="botones"><button class="boton primario">Aceptar</button><button type="button" class="boton" data-cerrar>Cancelar</button></div></form>`, { alCerrar: () => ok(null) });
    h.el.querySelector('form').onsubmit = e => { e.preventDefault(); const v = e.target.v.value; h.el.parentElement.remove(); ok(v); };
  });
}
