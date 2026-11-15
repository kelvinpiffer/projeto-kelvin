import { compactDay, brNow } from '../lib/store.mjs';

/* Consolida os eventos de hoje e de ontem de tempos em tempos, mesmo com o painel fechado. */
export default async () => {
  const deadline = Date.now() + 20000;
  await compactDay(brNow().day, deadline);
  await compactDay(brNow(Date.now() - 86400000).day, deadline);
};

export const config = { schedule: '*/15 * * * *' };
