import { getStore } from '@netlify/blobs';

/*
  Armazenamento (Netlify Blobs, store "utm"):
    raw/<dia>/<evento codificado>.<id>   um blob vazio por evento — o dado vai na própria chave,
                                         então gravar nunca colide e ler é só listar.
    agg/<dia>                            contadores consolidados do dia.
  compactDay() junta os raw no agg e apaga os raw já somados.
*/

export const store = () => getStore({ name: 'utm', consistency: 'strong' });

/* Dia e hora no fuso de Brasília (UTC-3, sem horário de verão) */
export function brNow(ms = Date.now()) {
  const d = new Date(ms - 3 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

/* dims = [ev, target, source, medium, campaign, content, term] */
export function rawKey(dims, unique) {
  const { day, hour } = brNow();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let d = dims.slice();
  let enc = b64(JSON.stringify([hour, ...d, unique ? 1 : 0]));
  if (enc.length > 520) {
    d = d.map((x) => String(x).slice(0, 16));
    enc = b64(JSON.stringify([hour, ...d, unique ? 1 : 0]));
  }
  return `raw/${day}/${enc}.${id}`;
}

function parseRaw(key) {
  try {
    const name = key.slice(key.lastIndexOf('/') + 1);
    const arr = JSON.parse(unb64(name.slice(0, name.lastIndexOf('.'))));
    if (!Array.isArray(arr) || arr.length !== 9) return null;
    return { k: JSON.stringify(arr.slice(0, 8)), u: arr[8] ? 1 : 0 };
  } catch (e) {
    return null;
  }
}

async function pool(items, size, fn, deadline) {
  let i = 0;
  const run = async () => {
    while (i < items.length && Date.now() < deadline) {
      const it = items[i++];
      try { await fn(it); } catch (e) { /* tenta de novo na próxima compactação */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}

/*
  Devolve os contadores do dia: { '<[hora,ev,alvo,src,med,camp,content,term]>': [cliques, únicos] }
  e, se der, consolida. `done` guarda as chaves raw já somadas (chave -> quando), para que um raw
  que ainda não foi apagado (ou reaparece na listagem) nunca seja contado duas vezes.
*/
export async function compactDay(day, deadline = Date.now() + 6000) {
  const s = store();
  const cur = await s.getWithMetadata(`agg/${day}`, { type: 'json' });
  const rows = (cur && cur.data && cur.data.rows) || {};
  const done = (cur && cur.data && cur.data.done) || {};
  const { blobs } = await s.list({ prefix: `raw/${day}/` });
  const keys = blobs.map((b) => b.key);

  const fresh = keys.filter((k) => !(k in done));
  for (const k of fresh) {
    const ev = parseRaw(k);
    if (!ev) continue;
    const r = rows[ev.k] || (rows[ev.k] = [0, 0]);
    r[0] += 1;
    r[1] += ev.u;
  }
  if (!keys.length) return rows;

  const now = Date.now();
  const listed = new Set(keys);
  const nextDone = {};
  for (const k of keys) nextDone[k] = done[k] || now;
  for (const k in done) if (!listed.has(k) && now - done[k] < 15 * 60000) nextDone[k] = done[k];

  let saved = false;
  try {
    const opts = cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
    const res = await s.setJSON(`agg/${day}`, { v: 1, rows, done: nextDone }, opts);
    saved = !!(res && res.modified);
  } catch (e) { saved = false; }

  /* só apaga os raw se o consolidado foi gravado por esta execução */
  if (saved) await pool(keys, 30, (k) => s.delete(k), deadline);
  return rows;
}

export function daysBetween(from, to) {
  const out = [];
  const a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return out;
  for (let t = a; t <= b && out.length < 92; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
