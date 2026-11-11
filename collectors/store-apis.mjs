// Store APIs: runs every adapter whose keys exist (GitHub Actions secrets) -> data/api-prices.json.
// With no keys, writes a status file saying each adapter is waiting for keys. Never invents a price.
// Nov 11 2026: adapters that also export deals()/matches() (eBay) add "top_deals" (real discounts today) and
// "matches" (the Online-deals items priced on eBay); their searches live in collectors/config/<adapter>.json.
import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const names = ['ebay', 'aliexpress', 'impact', 'cj', 'rakuten', 'amazon'];
const terms = JSON.parse(await fs.readFile(path.join(ROOT, 'collectors/config/api-terms.json'), 'utf8')).terms;
const status = []; let offers = []; let topDeals = []; let matches = [];
for (const n of names) {
  let a; try { a = await import(`./adapters/${n}.mjs`); } catch { continue; }
  if (!a.enabled()) { status.push({ id: n, name: a.name, state: 'waiting for keys' }); continue; }
  const st = { id: n, name: a.name, state: 'ok' };
  try {
    const got = a.search ? await a.search(terms) : []; offers.push(...got); st.offers = got.length; console.log(a.name, 'offers', got.length);
    let cfg = null; try { cfg = JSON.parse(await fs.readFile(path.join(ROOT, `collectors/config/${n}.json`), 'utf8')); } catch {}
    if (cfg && a.deals) { const d = await a.deals(cfg); topDeals.push(...d); st.top_deals = d.length; console.log(a.name, 'top deals', d.length); }
    if (cfg && a.matches) { const m = await a.matches(cfg); matches.push(...m); st.matches = m.length; console.log(a.name, 'matches', m.length); }
    if (a.calls) st.api_calls = a.calls();
  } catch (e) { st.state = 'error'; st.error = e.message; console.log(a.name, 'error', e.message); }
  status.push(st);
}
const checked = new Date().toISOString();
const ok = (o) => o.title && /^https:\/\//.test(o.url || '') && o.price > 0;
offers = offers.filter(ok).map((o) => ({ ...o, checked }));
topDeals = topDeals.filter(ok).map((o) => ({ ...o, checked }));
matches = matches.filter(ok).map((o) => ({ ...o, checked }));
let prev = null; try { prev = JSON.parse(await fs.readFile(path.join(ROOT, 'data/api-prices.json'), 'utf8')); } catch {}
// An API hiccup never blanks the site: keep the last good lists (they carry their own "checked" time).
if (prev && status.some((s) => s.state === 'error')) {
  if (!offers.length && prev.offers && prev.offers.length) offers = prev.offers;
  if (!topDeals.length && prev.top_deals && prev.top_deals.length) topDeals = prev.top_deals;
  if (!matches.length && prev.matches && prev.matches.length) matches = prev.matches;
  prev.adapters = status;
}
await fs.writeFile(path.join(ROOT, 'data/api-prices.json'), JSON.stringify({ updated: checked, adapters: status, offers, top_deals: topDeals, matches }));
console.log('api adapters:', status.map((s) => `${s.id}=${s.state}`).join(' '));
