// Almacenamiento local en IndexedDB. Los registros se guardan SIEMPRE cifrados con la clave familiar;
// en memoria solo están descifrados mientras la app está desbloqueada.
import { cifrarJSON, descifrarJSON } from './core/cripto.js';
import { uid } from './core/util.js';

const NOMBRE_BD = 'gestor-familiar';
let bdPromesa;

function bd() {
  bdPromesa ??= new Promise((ok, ko) => {
    const r = indexedDB.open(NOMBRE_BD, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('kv');
      const s = db.createObjectStore('recs', { keyPath: 'id' });
      s.createIndex('sucio', 'sucio');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return bdPromesa;
}

function tx(store, modo, fn) {
  return bd().then(db => new Promise((ok, ko) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let res;
    Promise.resolve(fn(s)).then(v => { res = v; });
    t.oncomplete = () => ok(res);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  }));
}

const req = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

export const kv = {
  get: k => tx('kv', 'readonly', s => req(s.get(k))),
  set: (k, v) => tx('kv', 'readwrite', s => { s.put(v, k); }),
  del: k => tx('kv', 'readwrite', s => { s.delete(k); }),
};

export async function borrarTodoLocal() {
  await tx('recs', 'readwrite', s => { s.clear(); });
  await tx('kv', 'readwrite', s => { s.clear(); });
}

// Tipos de registro: mov (movimiento), cat (categoría), regla, tarjeta, ajuste, imp (importación)
export const TIPOS_REG = ['mov', 'cat', 'regla', 'tarjeta', 'ajuste', 'imp', 'grupo'];

export class Repositorio {
  constructor() {
    this.clave = null;
    this.datos = Object.fromEntries(TIPOS_REG.map(t => [t, new Map()]));
    this.oyentes = new Set();
  }

  alCambiar(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }
  avisar(motivo) { for (const f of this.oyentes) try { f(motivo); } catch (e) { console.error(e); } }

  async abrir(clave) {
    this.clave = clave;
    const recs = await tx('recs', 'readonly', s => req(s.getAll()));
    for (const t of TIPOS_REG) this.datos[t].clear();
    let fallos = 0;
    await Promise.all(recs.map(async r => {
      if (r.borrado || !r.ct) return;
      try {
        const obj = await descifrarJSON(clave, r, r.id);
        this.datos[r.tipo]?.set(r.id, obj);
      } catch { fallos++; }
    }));
    if (fallos && fallos === recs.filter(r => r.ct).length && recs.length) throw new Error('No se pueden descifrar los datos con esta clave');
    return { total: recs.length, fallos };
  }

  cerrar() { this.clave = null; for (const t of TIPOS_REG) this.datos[t].clear(); }

  lista(tipo) { return [...this.datos[tipo].values()]; }
  obtener(tipo, id) { return this.datos[tipo].get(id); }

  // Guarda uno o varios objetos {id?, ...} del mismo tipo
  async guardar(tipo, objs, { silencioso = false } = {}) {
    const arr = Array.isArray(objs) ? objs : [objs];
    const ahora = Date.now();
    const filas = [];
    for (const o of arr) {
      o.id ||= uid(tipo[0] + '_');
      o.mod = ahora;
      const sobre = await cifrarJSON(this.clave, o, o.id);
      filas.push({ id: o.id, tipo, iv: sobre.iv, ct: sobre.ct, mod: ahora, sucio: 1, borrado: 0 });
      this.datos[tipo].set(o.id, o);
    }
    await tx('recs', 'readwrite', s => { for (const f of filas) s.put(f); });
    if (!silencioso) this.avisar(tipo);
    return arr;
  }

  async borrar(tipo, ids) {
    const arr = Array.isArray(ids) ? ids : [ids];
    await tx('recs', 'readwrite', s => {
      for (const id of arr) s.put({ id, tipo, mod: Date.now(), sucio: 1, borrado: 1 });
    });
    for (const id of arr) this.datos[tipo].delete(id);
    this.avisar(tipo);
  }

  // ---- Para la sincronización ----
  pendientesDeSubir() { return tx('recs', 'readonly', s => req(s.index('sucio').getAll(1))); }

  async marcarSubidos(filas) {
    await tx('recs', 'readwrite', s => {
      for (const f of filas) {
        const g = s.get(f.id);
        g.onsuccess = () => {
          const actual = g.result;
          if (actual && actual.mod === f.mod) { actual.sucio = 0; s.put(actual); }
        };
      }
    });
  }

  // Aplica registros cifrados que llegan del servidor (gana el más reciente)
  async aplicarRemotos(remotos) {
    if (!remotos.length) return 0;
    const locales = new Map((await tx('recs', 'readonly', s => req(s.getAll()))).map(r => [r.id, r]));
    const aplicar = [];
    for (const r of remotos) {
      const l = locales.get(r.id);
      if (l && l.sucio && l.mod > r.mod) continue; // mi cambio local es más nuevo: se subirá
      aplicar.push(r);
    }
    for (const r of aplicar) {
      if (r.borrado) { this.datos[r.tipo]?.delete(r.id); continue; }
      try { this.datos[r.tipo]?.set(r.id, await descifrarJSON(this.clave, r, r.id)); } catch (e) { console.warn('registro ilegible', r.id); }
    }
    await tx('recs', 'readwrite', s => {
      for (const r of aplicar) s.put({ id: r.id, tipo: r.tipo, iv: r.iv, ct: r.ct, mod: r.mod, sucio: 0, borrado: r.borrado ? 1 : 0 });
    });
    if (aplicar.length) this.avisar('remoto');
    return aplicar.length;
  }

  // Exporta todo (descifrado) para la copia de seguridad
  exportar() {
    return { formato: 'gestor-familiar-datos', v: 1, fecha: new Date().toISOString(), datos: Object.fromEntries(TIPOS_REG.map(t => [t, this.lista(t)])) };
  }
}
