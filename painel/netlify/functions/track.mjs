import { store, rawKey } from '../lib/store.mjs';

/* Recebe os eventos do funil (dudinhalima.com). Público, só grava. */
const ORIGINS = ['https://dudinhalima.com', 'https://www.dudinhalima.com'];
const EVENTS = { view: 1, step: 1, cta: 1 };
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|monitor|curl|wget|python|scrapy/i;

const clean = (v, max = 48) =>
  String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

export default async (req) => {
  const origin = req.headers.get('origin') || '';
  const cors = {
    'access-control-allow-origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    vary: 'origin'
  };
  const end = (status) => new Response(null, { status, headers: cors });

  if (req.method === 'OPTIONS') return end(204);
  if (req.method !== 'POST') return end(405);
  if (!ORIGINS.includes(origin)) return end(403);
  if (BOT.test(req.headers.get('user-agent') || '')) return end(204);

  let b;
  try { b = JSON.parse((await req.text()).slice(0, 2000)); } catch (e) { return end(400); }
  if (!b || !EVENTS[b.e]) return end(400);

  let src = clean(b.s).toLowerCase();
  if (!src) {
    const ref = clean(b.r, 60).toLowerCase().replace(/^www\./, '');
    src = ref && !/dudinhalima\.com$/.test(ref) ? 'ref: ' + ref : '(direto)';
  }
  const dims = [
    b.e,
    clean(b.t, 24).toLowerCase(),
    src,
    clean(b.m).toLowerCase() || '(vazio)',
    clean(b.c) || '(vazio)',
    clean(b.ct) || '(vazio)',
    clean(b.tm) || '(vazio)'
  ];
  await store().set(rawKey(dims, b.u === 1), '');
  return end(204);
};

export const config = { path: '/api/e' };
