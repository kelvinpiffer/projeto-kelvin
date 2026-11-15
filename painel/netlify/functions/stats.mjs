import { createHash, timingSafeEqual } from 'node:crypto';
import { compactDay, daysBetween, brNow } from '../lib/store.mjs';

/* Leitura do painel. Exige a senha (variável PANEL_PASSWORD do site) no header x-key. */
const sha = (s) => createHash('sha256').update(String(s)).digest();

export default async (req) => {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });

  const pass = Netlify.env.get('PANEL_PASSWORD');
  const key = req.headers.get('x-key') || '';
  if (!pass || !timingSafeEqual(sha(key), sha(pass))) return json({ error: 'senha' }, 401);

  const url = new URL(req.url);
  const today = brNow().day;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : today;
  const to = re.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : today;
  const days = daysBetween(from, to);
  if (!days.length) return json({ error: 'periodo' }, 400);

  const deadline = Date.now() + 6000;
  const out = [];
  /* linhas: [dia, hora, evento, alvo, source, medium, campaign, content, term, cliques, únicos] */
  for (let i = 0; i < days.length; i += 8) {
    const part = await Promise.all(days.slice(i, i + 8).map((d) => compactDay(d, deadline)));
    part.forEach((rows, j) => {
      const day = days[i + j];
      for (const k in rows) out.push([day, ...JSON.parse(k), rows[k][0], rows[k][1]]);
    });
  }
  return json({ from: days[0], to: days[days.length - 1], today, hour: brNow().hour, rows: out });
};

export const config = { path: '/api/stats' };
