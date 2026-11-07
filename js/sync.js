// Sincronización con Supabase usando solo fetch (sin librerías externas).
// El servidor solo recibe registros ya cifrados: id, tipo, iv, ct, mod, borrado.
import { kv } from './almacen.js';
import { b64url } from './core/cripto.js';

const CLAVE_CONF = 'sync-conf';     // { url, anonKey }
const CLAVE_SESION = 'sync-sesion'; // { access_token, refresh_token, expires_at, user }
const CLAVE_CURSOR = 'sync-cursor'; // última updated_at descargada

export class Sync {
  constructor(repo) { this.repo = repo; this.conf = null; this.sesion = null; this.familia = null; this.ocupado = false; }

  async cargar() {
    this.conf = await kv.get(CLAVE_CONF) || null;
    this.sesion = await kv.get(CLAVE_SESION) || null;
    this.familia = await kv.get('familia-id') || null;
    return this;
  }
  get configurado() { return !!(this.conf?.url && this.conf?.anonKey); }
  get conectado() { return this.configurado && !!this.sesion?.access_token; }
  get email() { return this.sesion?.user?.email || null; }

  async configurar(url, anonKey) {
    url = url.trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('La URL debe ser del tipo https://xxxx.supabase.co');
    this.conf = { url, anonKey: anonKey.trim() };
    await kv.set(CLAVE_CONF, this.conf);
  }

  // ---- Inicio de sesión con Google / Microsoft (OAuth con PKCE) ----
  async iniciarSesion(proveedor) {
    const verificador = b64url.de(crypto.getRandomValues(new Uint8Array(32)));
    const reto = b64url.de(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))));
    sessionStorage.setItem('pkce', verificador);
    const vuelta = location.origin + location.pathname;
    const p = new URLSearchParams({ provider: proveedor, redirect_to: vuelta, code_challenge: reto, code_challenge_method: 's256' });
    if (proveedor === 'azure') p.set('scopes', 'email');
    location.href = `${this.conf.url}/auth/v1/authorize?${p}`;
  }

  // Llamar al arrancar: completa el login si volvemos de Google/Microsoft
  async completarLoginSiHay() {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.slice(1));
    let datos = null;
    if (q.get('code') && this.configurado) {
      const verificador = sessionStorage.getItem('pkce');
      datos = await this.auth('token?grant_type=pkce', { auth_code: q.get('code'), code_verifier: verificador });
      sessionStorage.removeItem('pkce');
    } else if (h.get('access_token')) {
      datos = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: Number(h.get('expires_in') || 3600) };
      datos.user = await this.peticion('/auth/v1/user', { token: datos.access_token });
    } else if (q.get('error_description') || h.get('error_description')) {
      throw new Error('Inicio de sesión cancelado: ' + (q.get('error_description') || h.get('error_description')));
    }
    if (!datos) return false;
    history.replaceState(null, '', location.pathname);
    await this.guardarSesion(datos);
    return true;
  }

  async guardarSesion(d) {
    this.sesion = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user: d.user ? { id: d.user.id, email: d.user.email } : this.sesion?.user };
    await kv.set(CLAVE_SESION, this.sesion);
  }

  async cerrarSesion() {
    this.sesion = null; this.familia = null;
    await kv.del(CLAVE_SESION); await kv.del('familia-id'); await kv.del(CLAVE_CURSOR);
  }

  async auth(ruta, cuerpo) {
    const r = await fetch(`${this.conf.url}/auth/v1/${ruta}`, {
      method: 'POST', headers: { apikey: this.conf.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `Error de autenticación (${r.status})`);
    return j;
  }

  async token() {
    if (!this.sesion) throw new Error('No has iniciado sesión');
    if (Date.now() > this.sesion.expires_at - 60000) {
      const d = await this.auth('token?grant_type=refresh_token', { refresh_token: this.sesion.refresh_token });
      await this.guardarSesion(d);
    }
    return this.sesion.access_token;
  }

  async peticion(ruta, { metodo = 'GET', cuerpo, token, cabeceras = {} } = {}) {
    const t = token || await this.token();
    const r = await fetch(this.conf.url + ruta, {
      method: metodo,
      headers: { apikey: this.conf.anonKey, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...cabeceras },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.message || j?.error_description || `Error del servidor (${r.status})`);
    return j;
  }
  rpc(nombre, args = {}) { return this.peticion(`/rest/v1/rpc/${nombre}`, { metodo: 'POST', cuerpo: args }); }

  // ---- Familia ----
  async misFamilias() { return this.peticion('/rest/v1/familias?select=id,nombre,boveda,creada'); }
  async crearFamilia(nombre, boveda) {
    const id = await this.rpc('crear_familia', { p_nombre: nombre, p_boveda: boveda });
    await this.usarFamilia(id);
    return id;
  }
  async aceptarInvitacion() {
    const id = await this.rpc('aceptar_invitacion');
    if (id) await this.usarFamilia(id);
    return id;
  }
  async invitar(email) {
    return this.peticion('/rest/v1/invitaciones', { metodo: 'POST', cuerpo: { familia: this.familia, email: email.trim().toLowerCase() }, cabeceras: { Prefer: 'return=minimal' } });
  }
  async miembros() { return this.rpc('miembros_familia', { p_familia: this.familia }); }
  async usarFamilia(id) { this.familia = id; await kv.set('familia-id', id); await kv.del(CLAVE_CURSOR); }
  async actualizarBoveda(boveda) {
    return this.peticion(`/rest/v1/familias?id=eq.${this.familia}`, { metodo: 'PATCH', cuerpo: { boveda }, cabeceras: { Prefer: 'return=minimal' } });
  }

  // ---- Sincronizar: subir lo pendiente y bajar lo nuevo ----
  async sincronizar() {
    if (!this.conectado || !this.familia || !this.repo.clave || this.ocupado) return null;
    this.ocupado = true;
    try {
      let subidos = 0, bajados = 0;
      const pend = await this.repo.pendientesDeSubir();
      for (let i = 0; i < pend.length; i += 500) {
        const lote = pend.slice(i, i + 500);
        await this.peticion('/rest/v1/registros?on_conflict=id', {
          metodo: 'POST',
          cuerpo: lote.map(r => ({ id: r.id, familia: this.familia, tipo: r.tipo, iv: r.iv || null, ct: r.ct || null, mod: r.mod, borrado: !!r.borrado })),
          cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        });
        await this.repo.marcarSubidos(lote);
        subidos += lote.length;
      }
      let cursor = await kv.get(CLAVE_CURSOR) || '1970-01-01T00:00:00Z';
      for (;;) {
        const filas = await this.peticion(`/rest/v1/registros?select=id,tipo,iv,ct,mod,borrado,actualizado&familia=eq.${this.familia}&actualizado=gt.${encodeURIComponent(cursor)}&order=actualizado.asc&limit=1000`);
        if (!filas.length) break;
        bajados += await this.repo.aplicarRemotos(filas);
        cursor = filas[filas.length - 1].actualizado;
        await kv.set(CLAVE_CURSOR, cursor);
        if (filas.length < 1000) break;
      }
      await kv.set('sync-ultima', Date.now());
      return { subidos, bajados };
    } finally { this.ocupado = false; }
  }
}
