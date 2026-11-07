// Clasificación con Claude (opcional). Solo se envía lo imprescindible: tipo de operación, comercio y signo.
// En los Bizum se quita el nombre de la persona. Nunca se envían saldos, cuentas ni tarjetas.
import { comercio, esBizum, mensajeBizum } from './core/clasificador.js';
import { norm } from './core/util.js';

export const MODELO_POR_DEFECTO = 'claude-haiku-5-5';

export function textoParaIA(m) {
  if (esBizum(m)) {
    const dir = norm(m.desc).startsWith('BIZUM ABONO') ? 'Bizum recibido' : 'Bizum enviado';
    return `${dir}: "${mensajeBizum(m)}"`;
  }
  return `${m.tipoOp ? m.tipoOp + ' · ' : ''}${comercio(m) || norm(m.desc).slice(0, 60)}`;
}

export async function clasificarConIA(movs, cats, { apiKey, modelo = MODELO_POR_DEFECTO, contexto = '' }) {
  if (!apiKey) throw new Error('Falta la clave de la API de Claude (Ajustes > Inteligencia artificial)');
  if (!movs.length) return [];
  const listaCats = cats.map(c => `${c.id} = ${c.grupo} > ${c.nombre}${c.tipo === 'ingreso' ? ' (ingreso)' : ''}`).join('\n');
  const items = movs.map((m, i) => `${i}\t${m.importe < 0 ? 'cargo' : 'abono'}\t${Math.abs(m.importe).toFixed(0)}€\t${textoParaIA(m)}`).join('\n');
  const sistema = `Clasificas movimientos bancarios de una familia en Madrid (España).
Responde SOLO con un array JSON, sin texto alrededor. Un objeto por movimiento:
{"i": número, "cat": id de categoría o null si no hay forma razonable de saberlo, "tipo": "gasto"|"ingreso"|"reembolso"|"traspaso", "clave": palabra(s) del texto que identifican al comercio de forma estable (p. ej. "MERCADONA", "EE SS"), o null}
Reglas: "reembolso" = dinero que vuelve por un gasto (devolución de compra, amigo que paga su parte por Bizum) y lleva la categoría del gasto.
"traspaso" = movimiento entre cuentas propias. Usa "Otros > Compras varias" solo como último recurso.
${contexto ? 'Contexto de la familia: ' + contexto : ''}
Categorías:
${listaCats}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: Math.min(8000, 120 + movs.length * 60),
      system: sistema,
      messages: [{ role: 'user', content: `Movimientos (índice, sentido, importe, texto):\n${items}` }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Error de la API de Claude (${r.status})`);
  const texto = (j.content || []).map(b => b.text || '').join('');
  const ini = texto.indexOf('['), fin = texto.lastIndexOf(']');
  if (ini < 0 || fin < 0) throw new Error('La IA no devolvió una respuesta válida');
  const arr = JSON.parse(texto.slice(ini, fin + 1));
  const ids = new Set(cats.map(c => c.id));
  return arr.filter(x => Number.isInteger(x.i) && movs[x.i]).map(x => {
    const m = movs[x.i];
    const clave = x.clave && norm(m.desc).includes(norm(x.clave)) && norm(x.clave).length >= 3 ? norm(x.clave) : null;
    return {
      mov: m,
      cat: ids.has(x.cat) ? x.cat : null,
      tipo: ['gasto', 'ingreso', 'reembolso', 'traspaso'].includes(x.tipo) ? x.tipo : (m.importe < 0 ? 'gasto' : 'ingreso'),
      clave: esBizum(m) ? null : clave,
    };
  });
}

// Divide en lotes para no mandar peticiones enormes
export function lotes(lista, n = 60) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}
