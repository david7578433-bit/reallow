// Writes data/status.json: when each robot last ran and what it got (shown on the site's "Robots" panel).
import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = async (p) => { try { return JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8')); } catch { return null; } };
const g = await read('data/groceries.json'); const d = await read('deals.json'); const a = await read('data/api-prices.json');
const out = {
  run_at: new Date().toISOString(), schedule: 'every 4 hours (00:17, 04:17, 08:17, 12:17, 16:17, 20:17 UTC) + manual',
  groceries: g ? { updated: g.updated, ...g.stats, stores: g.stores.map((s) => ({ name: s.name, city: s.city, status: s.status, count: s.count, checked: s.checked, stale: !!s.stale })) } : null,
  deals: d ? { updated: d.updated, verified: (d.deals || []).length, feed: (d.feed || []).length, sources: d.sources } : null,
  store_apis: a ? a.adapters : null,
};
await fs.writeFile(path.join(ROOT, 'data/status.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ groceries: out.groceries && out.groceries.items, deals: out.deals && out.deals.feed }));
