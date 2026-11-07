// Cifrado de extremo a extremo con WebCrypto (AES-GCM 256).
// - La "clave familiar" cifra todos los datos. Nunca sale de vuestros dispositivos sin cifrar.
// - La "bóveda" es la clave familiar cifrada con la contraseña familiar (PBKDF2, 600.000 iteraciones).
// - En cada dispositivo, la clave se guarda además protegida por huella/Face ID (passkey PRF) o por un PIN.

const te = new TextEncoder();
const td = new TextDecoder();

export const b64 = {
  de(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  },
  a(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); },
};
const b64url = {
  de(bytes) { return b64.de(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  a(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return b64.a(s); },
};
export { b64url };

const aleatorio = n => crypto.getRandomValues(new Uint8Array(n));

export async function importarClaveDatos(raw, extraible = false) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extraible, ['encrypt', 'decrypt']);
}

export function nuevaClaveFamiliar() { return aleatorio(32); }

async function cifrarBytes(clave, bytes, aad) {
  const iv = aleatorio(12);
  const p = { name: 'AES-GCM', iv };
  if (aad) p.additionalData = te.encode(aad);
  const ct = new Uint8Array(await crypto.subtle.encrypt(p, clave, bytes));
  return { iv: b64.de(iv), ct: b64.de(ct) };
}

async function descifrarBytes(clave, { iv, ct }, aad) {
  const p = { name: 'AES-GCM', iv: b64.a(iv) };
  if (aad) p.additionalData = te.encode(aad);
  return new Uint8Array(await crypto.subtle.decrypt(p, clave, b64.a(ct)));
}

// aad = id del registro: impide intercambiar registros cifrados entre sí
export async function cifrarJSON(clave, obj, aad) { return cifrarBytes(clave, te.encode(JSON.stringify(obj)), aad); }
export async function descifrarJSON(clave, sobre, aad) { return JSON.parse(td.decode(await descifrarBytes(clave, sobre, aad))); }

async function claveDeSecreto(secreto, salt, iteraciones) {
  const base = await crypto.subtle.importKey('raw', te.encode(secreto.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteraciones },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---- Bóveda (contraseña familiar) ----
export async function crearBoveda(raw, contrasena, iteraciones = 600000) {
  const salt = aleatorio(16);
  const k = await claveDeSecreto(contrasena, salt, iteraciones);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: iteraciones, salt: b64.de(salt), ...(await cifrarBytes(k, raw, 'boveda')) };
}

export async function abrirBoveda(boveda, contrasena) {
  const k = await claveDeSecreto(contrasena, b64.a(boveda.salt), boveda.iter);
  try { return await descifrarBytes(k, boveda, 'boveda'); }
  catch { throw new Error('Contraseña familiar incorrecta'); }
}

// ---- PIN del dispositivo ----
export async function protegerConPin(raw, pin) {
  const salt = aleatorio(16);
  const k = await claveDeSecreto('pin:' + pin, salt, 310000);
  return { tipo: 'pin', salt: b64.de(salt), ...(await cifrarBytes(k, raw, 'pin')) };
}
export async function abrirConPin(prot, pin) {
  const k = await claveDeSecreto('pin:' + pin, b64.a(prot.salt), 310000);
  try { return await descifrarBytes(k, prot, 'pin'); }
  catch { throw new Error('PIN incorrecto'); }
}

// ---- Huella / Face ID (passkey con extensión PRF) ----
export function huellaDisponible() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials?.create;
}

async function claveDePrf(prfBytes) {
  const base = await crypto.subtle.importKey('raw', prfBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('gestor-familiar'), info: te.encode('clave-dispositivo') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Registra una passkey nueva y devuelve la clave familiar protegida con ella.
export async function protegerConHuella(raw, nombreUsuario) {
  const prfSalt = aleatorio(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: aleatorio(32),
      rp: { name: 'Gestor Familiar' },
      user: { id: aleatorio(16), name: nombreUsuario || 'familia', displayName: nombreUsuario || 'Familia' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const ext = cred.getClientExtensionResults?.() || {};
  if (!ext.prf?.enabled && !ext.prf?.results) throw new Error('Este dispositivo no permite usar la huella para cifrar (falta PRF). Usa un PIN.');
  const credId = b64url.de(cred.rawId);
  let prf = ext.prf?.results?.first;
  if (!prf) prf = await leerPrf(credId, prfSalt); // algunos sistemas solo lo dan al autenticar
  const k = await claveDePrf(new Uint8Array(prf));
  return { tipo: 'huella', credId, prfSalt: b64.de(prfSalt), ...(await cifrarBytes(k, raw, 'huella')) };
}

async function leerPrf(credId, prfSalt) {
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: aleatorio(32),
      allowCredentials: [{ type: 'public-key', id: b64url.a(credId) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const r = a.getClientExtensionResults?.().prf?.results?.first;
  if (!r) throw new Error('No se pudo leer la huella para descifrar');
  return r;
}

export async function abrirConHuella(prot) {
  const prf = await leerPrf(prot.credId, b64.a(prot.prfSalt));
  const k = await claveDePrf(new Uint8Array(prf));
  return descifrarBytes(k, prot, 'huella');
}

// Copia de seguridad cifrada (archivo .gfam) con la contraseña familiar
export async function cifrarCopia(obj, contrasena) {
  const salt = aleatorio(16);
  const k = await claveDeSecreto(contrasena, salt, 600000);
  return { formato: 'gestor-familiar-copia', v: 1, salt: b64.de(salt), iter: 600000, ...(await cifrarBytes(k, te.encode(JSON.stringify(obj)), 'copia')) };
}
export async function descifrarCopia(sobre, contrasena) {
  const k = await claveDeSecreto(contrasena, b64.a(sobre.salt), sobre.iter);
  try { return JSON.parse(td.decode(await descifrarBytes(k, sobre, 'copia'))); }
  catch { throw new Error('Contraseña incorrecta o archivo dañado'); }
}
