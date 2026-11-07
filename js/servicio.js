// Lógica de la app sobre el repositorio: importar extractos, clasificar, aprender, IA, migración y copias.
import { CATEGORIAS_BASE } from './core/categorias.js';
import { leerArchivoTabla } from './core/xlsx.js';
import { parsearExtracto, claveDuplicado } from './core/banco.js';
import { clasificar, aprender, reglaBase } from './core/clasificador.js';
import { clasificarConIA, lotes, MODELO_POR_DEFECTO } from './ia.js';
import { norm, uid } from './core/util.js';

const ID_AJUSTES = 'ajuste_general';

export class Servicio {
  constructor(repo) { this.repo = repo; }

  get cats() { return this.repo.lista('cat').filter(c => !c.oculta).sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre)); }
  get catsTodas() { return this.repo.lista('cat'); }
  get reglas() { return this.repo.lista('regla'); }
  get movs() { return this.repo.lista('mov'); }
  get tarjetas() { return this.repo.lista('tarjeta'); }
  get ajustes() {
    return { autoConfirmar: true, iaActiva: false, iaAutoConfirmar: false, modelo: MODELO_POR_DEFECTO, apiKey: '', contexto: '', ...(this.repo.obtener('ajuste', ID_AJUSTES) || {}) };
  }
  async guardarAjustes(cambios) { await this.repo.guardar('ajuste', { ...this.ajustes, ...cambios, id: ID_AJUSTES }); }

  ctx() {
    return {
      reglas: this.reglas,
      tarjetas: Object.fromEntries(this.tarjetas.map(t => [t.id.replace(/^t_/, ''), t])),
      cats: Object.fromEntries(this.catsTodas.map(c => [c.id, c])),
    };
  }

  nombreTarjeta(ref4) {
    if (!ref4) return null;
    return this.repo.obtener('tarjeta', 't_' + ref4)?.nombre || `Tarjeta …${ref4}`;
  }

  // Datos iniciales la primera vez
  async asegurarBase() {
    if (!this.repo.lista('cat').length) {
      await this.repo.guardar('cat', CATEGORIAS_BASE.map((c, i) => ({ ...c, orden: i })), { silencioso: true });
    }
    if (!this.repo.obtener('tarjeta', 't_0084')) {
      await this.repo.guardar('tarjeta', { id: 't_0084', nombre: 'Visa Euroimmun', ambito: 'euroimmun' }, { silencioso: true });
    }
  }

  // ---------- Importar extracto ----------
  async analizarArchivo(nombre, buffer) {
    const filas = await leerArchivoTabla(nombre, buffer);
    const ex = parsearExtracto(filas);
    const existentes = new Set(this.movs.map(m => m.h));
    const nuevos = ex.movs.filter(m => !existentes.has(m.h));
    return { ...ex, nombre, nuevos, duplicados: ex.movs.length - nuevos.length };
  }

  async confirmarImportacion(analisis) {
    const ctx = this.ctx();
    const aj = this.ajustes;
    const impId = uid('i_');
    // Tarjetas nuevas
    const nuevasT = [...new Set(analisis.nuevos.map(m => m.tarjeta).filter(Boolean))].filter(t => !ctx.tarjetas[t]);
    if (nuevasT.length) {
      await this.repo.guardar('tarjeta', nuevasT.map(t => ({ id: 't_' + t, nombre: `Tarjeta …${t}`, ambito: '' })), { silencioso: true });
      Object.assign(ctx.tarjetas, Object.fromEntries(this.tarjetas.map(t => [t.id.replace(/^t_/, ''), t])));
    }
    const movs = analisis.nuevos.map(m => {
      const c = clasificar(m, ctx);
      return {
        id: uid('m_'), ...m, fila: undefined,
        tipo: c.tipo, cat: c.cat, ambito: c.ambito, origen: c.origen, reglaId: c.reglaId, motivo: c.motivo,
        estado: c.fiable && aj.autoConfirmar ? 'ok' : 'pendiente', impId, creado: Date.now(),
      };
    });
    await this.repo.guardar('mov', movs, { silencioso: true });
    await this.repo.guardar('imp', {
      id: impId, archivo: analisis.nombre, fecha: Date.now(), cuenta: analisis.cuenta, desde: analisis.desde, hasta: analisis.hasta,
      n: movs.length, duplicados: analisis.duplicados, saldoFinal: analisis.saldoFinal, saldoOk: analisis.saldoOk,
    });
    return { total: movs.length, auto: movs.filter(m => m.estado === 'ok').length, pendientes: movs.filter(m => m.estado === 'pendiente').length, movs };
  }

  // ---------- Revisar y aprender ----------
  // cambios: { tipo?, cat?, ambito?, nota? } ; confirma y aprende una regla
  async confirmar(ids, cambios = {}, { aprenderRegla = true } = {}) {
    const arr = Array.isArray(ids) ? ids : [ids];
    const reglasNuevas = new Map(this.reglas.map(r => [r.id, r]));
    const movs = [];
    for (const id of arr) {
      const m = this.repo.obtener('mov', id);
      if (!m) continue;
      const n = { ...m, ...cambios, estado: 'ok' };
      if (n.tipo === 'traspaso') n.cat = null;
      if ('cat' in cambios || 'tipo' in cambios) n.origen = 'manual';
      if (aprenderRegla && (n.cat || n.tipo === 'traspaso')) {
        const r = aprender(n, n, [...reglasNuevas.values()]);
        if (r) { reglasNuevas.set(r.id, r); n.reglaId = r.id; }
      }
      movs.push(n);
    }
    const cambiadas = [...reglasNuevas.values()].filter(r => {
      const antes = this.repo.obtener('regla', r.id);
      return !antes || JSON.stringify(antes) !== JSON.stringify(r);
    });
    if (cambiadas.length) await this.repo.guardar('regla', cambiadas, { silencioso: true });
    await this.repo.guardar('mov', movs);
    return { movs: movs.length, reglas: cambiadas.length };
  }

  // Al confirmar uno, aplica lo aprendido a los demás pendientes
  async reclasificarPendientes() {
    const ctx = this.ctx();
    const aj = this.ajustes;
    const cambiados = [];
    for (const m of this.movs) {
      if (m.estado !== 'pendiente' || m.origen === 'manual') continue;
      const c = clasificar(m, ctx);
      if (!c.cat && c.tipo !== 'traspaso') continue;
      if (c.cat === m.cat && c.tipo === m.tipo && c.ambito === m.ambito && c.origen !== 'regla') continue;
      if (m.origen === 'ia' && c.origen !== 'regla') continue;
      cambiados.push({ ...m, tipo: c.tipo, cat: c.cat, ambito: c.ambito, origen: c.origen, reglaId: c.reglaId, motivo: c.motivo, estado: c.fiable && aj.autoConfirmar ? 'ok' : 'pendiente' });
    }
    if (cambiados.length) await this.repo.guardar('mov', cambiados);
    return cambiados.length;
  }

  async editarMov(id, cambios) {
    const m = this.repo.obtener('mov', id);
    const n = { ...m, ...cambios };
    if (n.tipo === 'traspaso') n.cat = null;
    if ('cat' in cambios || 'tipo' in cambios) n.origen = 'manual';
    await this.repo.guardar('mov', n);
    return n;
  }

  async crearMovManual({ fecha, desc, importe, tipo, cat, ambito, nota }) {
    const imp = Math.abs(Number(importe)) * (tipo === 'gasto' ? -1 : 1);
    const m = { id: uid('m_'), fecha, desc, tipoOp: 'MANUAL', importe: imp, tipo, cat, ambito: ambito || 'familia', nota, estado: 'ok', origen: 'manual', creado: Date.now() };
    m.h = claveDuplicado(m, Date.now());
    await this.repo.guardar('mov', m);
    return m;
  }

  // ---------- IA ----------
  async clasificarPendientesConIA(onProgreso) {
    const aj = this.ajustes;
    const pendientes = this.movs.filter(m => m.estado === 'pendiente' && !m.cat && m.tipo !== 'traspaso' && m.origen !== 'manual');
    if (!pendientes.length) return { n: 0 };
    const cats = this.cats;
    let hechos = 0, reglasIA = 0;
    for (const lote of lotes(pendientes, 50)) {
      const res = await clasificarConIA(lote, cats, { apiKey: aj.apiKey, modelo: aj.modelo, contexto: aj.contexto });
      const movs = [], reglas = [];
      const existentes = new Set(this.reglas.map(r => norm(r.patron) + '|' + (r.signo || '')));
      for (const x of res) {
        if (!x.cat && x.tipo !== 'traspaso') continue;
        const ambito = this.ctx().tarjetas[x.mov.tarjeta]?.ambito || (x.cat?.startsWith('eur-') || x.cat === 'ing-euroimmun' ? 'euroimmun' : x.cat?.startsWith('wal-') || x.cat === 'ing-wallapop' ? 'wallapop' : x.mov.ambito);
        movs.push({ ...x.mov, cat: x.cat, tipo: x.tipo, ambito, origen: 'ia', motivo: 'Sugerido por la IA', estado: aj.iaAutoConfirmar ? 'ok' : 'pendiente' });
        const signo = x.mov.importe >= 0 ? '+' : '-';
        if (x.clave && !existentes.has(x.clave + '|' + signo)) {
          existentes.add(x.clave + '|' + signo);
          reglas.push({ id: uid('r_'), patron: x.clave, signo, tipoOp: '', cat: x.cat, tipo: x.tipo, ambito: '', origen: 'ia', usos: 0, creada: Date.now() });
        }
      }
      if (reglas.length) await this.repo.guardar('regla', reglas, { silencioso: true });
      if (movs.length) await this.repo.guardar('mov', movs);
      hechos += movs.length; reglasIA += reglas.length;
      onProgreso?.(hechos, pendientes.length);
    }
    return { n: hechos, total: pendientes.length, reglas: reglasIA };
  }

  // ---------- Migración desde la app antigua ----------
  async importarMigracion(json) {
    if (json?.formato !== 'gestor-familiar-migracion') throw new Error('Este archivo no es una migración de la app antigua');
    const existentes = new Set(this.movs.map(m => m.h));
    const vistos = new Map();
    const movs = [];
    for (const o of json.movs) {
      const base = claveDuplicado(o, 0);
      const n = vistos.get(base) || 0; vistos.set(base, n + 1);
      const h = claveDuplicado(o, n);
      if (existentes.has(h)) continue;
      const tipoOp = /^BIZUM /.test(norm(o.desc)) ? 'IBERCAJA PAY' : '';
      movs.push({ id: uid('m_'), ...o, tipoOp, h, estado: o.cat || o.tipo === 'traspaso' ? 'ok' : 'pendiente', origen: 'migrado', creado: Date.now() });
    }
    // Aprender reglas de todo lo ya clasificado
    let reglas = this.reglas.slice();
    const tocadas = new Map();
    for (const m of movs) {
      if (!m.cat || m.estado !== 'ok' || reglaBase(m)?.cat === m.cat) continue;
      const r = aprender(m, m, reglas);
      if (r) { reglas = reglas.filter(x => x.id !== r.id).concat(r); tocadas.set(r.id, r); }
    }
    await this.repo.guardar('mov', movs, { silencioso: true });
    if (tocadas.size) await this.repo.guardar('regla', [...tocadas.values()], { silencioso: true });
    const cats = [];
    for (const [id, p] of Object.entries(json.presupuestos || {})) {
      const c = this.repo.obtener('cat', id);
      if (c && !c.presupuesto) cats.push({ ...c, presupuesto: p });
    }
    if (cats.length) await this.repo.guardar('cat', cats, { silencioso: true });
    this.repo.avisar('mov');
    return { movs: movs.length, reglas: tocadas.size, omitidos: json.movs.length - movs.length };
  }

  // ---------- Copia de seguridad ----------
  async restaurarDatos(obj) {
    if (obj?.formato !== 'gestor-familiar-datos') throw new Error('Archivo de copia no reconocido');
    for (const [tipo, lista] of Object.entries(obj.datos)) {
      if (lista?.length) await this.repo.guardar(tipo, lista, { silencioso: true });
    }
    this.repo.avisar('restaurado');
  }
}
