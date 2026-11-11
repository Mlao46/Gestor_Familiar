// Lector mínimo de .xlsx y .csv sin dependencias (funciona en navegador y en Node 18+).
// Devuelve la primera hoja como matriz de filas: [[celda, celda, ...], ...]

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function leerZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Buscar el final del directorio central
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un Excel .xlsx válido');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entradas = {};
  const td = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const tamComp = dv.getUint32(p + 20, true);
    const lnNombre = dv.getUint16(p + 28, true);
    const lnExtra = dv.getUint16(p + 30, true);
    const lnCom = dv.getUint16(p + 32, true);
    const offLocal = dv.getUint32(p + 42, true);
    const nombre = td.decode(buf.subarray(p + 46, p + 46 + lnNombre));
    entradas[nombre] = { metodo, tamComp, offLocal };
    p += 46 + lnNombre + lnExtra + lnCom;
  }
  return {
    nombres: Object.keys(entradas),
    async leer(nombre) {
      const e = entradas[nombre];
      if (!e) return null;
      const lnN = dv.getUint16(e.offLocal + 26, true);
      const lnE = dv.getUint16(e.offLocal + 28, true);
      const ini = e.offLocal + 30 + lnN + lnE;
      const datos = buf.subarray(ini, ini + e.tamComp);
      const raw = e.metodo === 0 ? datos : await inflateRaw(datos);
      return td.decode(raw);
    },
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function desescapar(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, c) => {
    if (c[0] === '#') return String.fromCodePoint(c[1] === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10));
    return ENT[c] ?? m;
  });
}

function textoDe(xml) {
  // Concatena todos los <t>...</t> (texto enriquecido incluido)
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) out += m[1];
  return desescapar(out);
}

// Algunos bancos generan el XML con prefijos de espacio de nombres (<x:row>, <x:c>…): se quitan.
function sinPrefijos(xml) {
  return xml ? xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, '<$1') : xml;
}

function colIndex(ref) {
  const letras = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function leerXlsx(arrayBuffer) {
  const zip = leerZip(new Uint8Array(arrayBuffer));
  // Hoja: la primera según workbook.xml + rels; si falla, sheet1.xml
  let rutaHoja = 'xl/worksheets/sheet1.xml';
  try {
    const wb = sinPrefijos(await zip.leer('xl/workbook.xml'));
    const rels = await zip.leer('xl/_rels/workbook.xml.rels');
    const rid = wb.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
    const target = rels && rid && rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
      || rels?.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
    if (target) rutaHoja = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  } catch { /* usar por defecto */ }
  if (!zip.nombres.includes(rutaHoja)) rutaHoja = zip.nombres.find(n => /^xl\/worksheets\/.*\.xml$/.test(n));
  const compartidas = [];
  const ss = sinPrefijos(await zip.leer('xl/sharedStrings.xml'));
  if (ss) {
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(ss))) compartidas.push(textoDe(m[1]));
  }
  const hoja = sinPrefijos(await zip.leer(rutaHoja));
  const filas = [];
  // Filas vacías pueden venir autocerradas: <row r="1" />
  const reFila = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let mf;
  while ((mf = reFila.exec(hoja))) {
    const r = Number(mf[1].match(/\br="(\d+)"/)?.[1] ?? filas.length + 1) - 1;
    const fila = [];
    const reCelda = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let mc;
    while ((mc = reCelda.exec(mf[2] || ''))) {
      const attrs = mc[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const t = attrs.match(/\bt="(\w+)"/)?.[1];
      const cuerpo = mc[2] || '';
      let v = null;
      const vm = cuerpo.match(/<v>([\s\S]*?)<\/v>/);
      if (t === 's' && vm) v = compartidas[Number(vm[1])] ?? '';
      else if (t === 'inlineStr') v = textoDe(cuerpo);
      else if (t === 'str' && vm) v = desescapar(vm[1]);
      else if (t === 'b' && vm) v = vm[1] === '1';
      else if (vm) v = Number(vm[1]);
      const ci = ref ? colIndex(ref) : fila.length;
      fila[ci] = v;
    }
    for (let i = 0; i < fila.length; i++) if (fila[i] === undefined) fila[i] = null;
    filas[r] = fila;
  }
  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
  return filas;
}

export function leerCsv(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n');
  const cab = lineas.find(l => l.trim()) || '';
  const sep = (cab.match(/;/g) || []).length >= (cab.match(/,/g) || []).length ? ';' : ',';
  return lineas.map(l => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim() === '' ? null : x.trim());
  });
}

export async function leerArchivoTabla(nombre, arrayBuffer) {
  const n = nombre.toLowerCase();
  if (n.endsWith('.xlsx') || n.endsWith('.xlsm')) return leerXlsx(arrayBuffer);
  if (n.endsWith('.csv') || n.endsWith('.txt')) {
    let txt = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(arrayBuffer);
    return leerCsv(txt);
  }
  if (n.endsWith('.xls')) throw new Error('Formato .xls antiguo: ábrelo en Excel y guárdalo como .xlsx, o descárgalo del banco en .xlsx');
  throw new Error('Formato no soportado. Usa .xlsx o .csv');
}
