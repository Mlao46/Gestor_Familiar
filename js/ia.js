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
  const sistema = `Clasificas movimientos bancarios de una familia en Madrid (España) usando la herramienta "guardar_clasificacion".
Para cada movimiento indica: "i" (su índice), "cat" (id de categoría de la lista, o null si no hay forma razonable de saberlo), "tipo" y "clave" (palabra o palabras del texto que identifican al comercio de forma estable, p. ej. "MERCADONA" o "EE SS"; null si no hay).
"reembolso" = dinero que vuelve por un gasto (devolución de una compra, un amigo que paga su parte por Bizum) y lleva la categoría del gasto.
"traspaso" = movimiento entre cuentas propias. Usa "Compras varias" solo como último recurso.
${contexto ? 'Contexto de la familia: ' + contexto : ''}
Categorías (id = grupo > nombre):
${listaCats}`;
  const herramienta = {
    name: 'guardar_clasificacion',
    description: 'Guarda la categoría sugerida para cada movimiento.',
    input_schema: {
      type: 'object',
      properties: {
        resultados: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              i: { type: 'integer' },
              cat: { type: ['string', 'null'] },
              tipo: { type: 'string', enum: ['gasto', 'ingreso', 'reembolso', 'traspaso'] },
              clave: { type: ['string', 'null'] },
            },
            required: ['i', 'cat', 'tipo'],
          },
        },
      },
      required: ['resultados'],
    },
  };
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: (modelo || MODELO_POR_DEFECTO).trim(),
        max_tokens: Math.min(16000, 1024 + movs.length * 80),
        system: sistema,
        tools: [herramienta],
        tool_choice: { type: 'tool', name: 'guardar_clasificacion' },
        messages: [{ role: 'user', content: `Movimientos (índice, sentido, importe, texto):\n${items}` }],
      }),
    });
  } catch (e) {
    throw new Error('No se pudo conectar con la API de Claude. Comprueba la conexión y que ningún bloqueador de anuncios o extensión impida el acceso a api.anthropic.com.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(explicarError(r.status, j?.error?.message || ''));
  let arr = (j.content || []).find(b => b.type === 'tool_use')?.input?.resultados;
  if (!Array.isArray(arr)) {
    // Plan B: buscar un array JSON en el texto
    const texto = (j.content || []).map(b => b.text || '').join('');
    const ini = texto.indexOf('['), fin = texto.lastIndexOf(']');
    try { arr = JSON.parse(texto.slice(ini, fin + 1)); } catch { arr = null; }
  }
  if (!Array.isArray(arr)) {
    const motivo = j.stop_reason === 'max_tokens' ? 'la respuesta se cortó por larga' : `motivo de parada: ${j.stop_reason || 'desconocido'}`;
    throw new Error(`La IA respondió pero no en el formato esperado (${motivo}, modelo ${j.model || modelo}). Prueba con menos movimientos o con el modelo por defecto.`);
  }
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

// Traduce los errores habituales de la API a algo que se pueda arreglar
export function explicarError(status, msg) {
  const m = msg.toLowerCase();
  if (m.includes('credit balance')) return 'Tu cuenta de la API no tiene saldo. En console.anthropic.com › Billing añade crédito.';
  if (status === 401 || m.includes('x-api-key') || m.includes('authentication')) return 'La clave de la API no es válida. Cópiala de nuevo desde console.anthropic.com › API Keys (empieza por sk-ant-) sin espacios.';
  if (status === 403) return 'La clave no tiene permiso para este uso. Revisa en la consola que la clave esté activa y que el espacio de trabajo permite usar el modelo.';
  if (status === 404 || m.includes('model')) return `El modelo indicado no existe o no está disponible para tu cuenta (${msg}). Prueba a dejar el campo Modelo con el valor por defecto.`;
  if (status === 429) return 'Has superado el límite de peticiones o de gasto. Espera un minuto o revisa los límites en la consola.';
  if (status >= 500) return 'La API de Claude está saturada o con problemas. Inténtalo de nuevo en unos minutos.';
  return `Error de la API de Claude (${status}): ${msg}`;
}
