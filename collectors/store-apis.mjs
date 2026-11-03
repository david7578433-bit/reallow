// Store APIs: runs every adapter whose keys exist (GitHub Actions secrets) -> data/api-prices.json.
// With no keys, writes a status file saying each adapter is waiting for keys. Never invents a price.
import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const names = ['ebay', 'impact', 'cj', 'rakuten', 'amazon'];
const terms = JSON.parse(await fs.readFile(path.join(ROOT, 'collectors/config/api-terms.json'), 'utf8')).terms;
const status = []; let offers = [];
for (const n of names) {
  const a = await import(`./adapters/${n}.mjs`);
  if (!a.enabled()) { status.push({ id: n, name: a.name, state: 'waiting for keys' }); continue; }
  try { const got = await a.search(terms); offers.push(...got); status.push({ id: n, name: a.name, state: 'ok', offers: got.length }); console.log(a.name, got.length); }
  catch (e) { status.push({ id: n, name: a.name, state: 'error', error: e.message }); console.log(a.name, 'error', e.message); }
}
const checked = new Date().toISOString();
offers = offers.filter((o) => o.title && o.url && o.price > 0).map((o) => ({ ...o, checked }));
let prev = null; try { prev = JSON.parse(await fs.readFile(path.join(ROOT, 'data/api-prices.json'), 'utf8')); } catch {}
if (!offers.length && prev && prev.offers && prev.offers.length && status.some((s) => s.state === 'error')) { prev.adapters = status; offers = prev.offers; }
await fs.writeFile(path.join(ROOT, 'data/api-prices.json'), JSON.stringify({ updated: checked, adapters: status, offers }));
console.log('api adapters:', status.map((s) => `${s.id}=${s.state}`).join(' '));
