// Collector A: kosher grocery catalogs -> data/groceries.json
// Reads each store's own public catalog JSON (My Cloud Grocer). Matches items across stores by barcode (UPC).
// Polite: one request every 1.5 s per site, honest User-Agent, robots.txt respected, stops a store on any block.
import fs from 'node:fs/promises';
import path from 'node:path';
import { politeFetch, Blocked } from './lib/polite.mjs';
import { serializeGroceries } from './lib/serialize.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cfg = JSON.parse(await fs.readFile(path.join(ROOT, 'collectors/config/grocery-stores.json'), 'utf8'));
const MAX_PAGES = Number(process.env.GROCERY_MAX_PAGES || 400);
const DELAY = Number(process.env.GROCERY_DELAY_MS || 1500);

function parsePrice(s) { const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; }
function unitOf(s) { const m = String(s || '').match(/\/\s*(lb|kg|oz|each|ea|pkg|bunch|dozen)/i); return m && !/each|ea/i.test(m[1]) ? m[1].toLowerCase() : ''; }
function cleanName(n) { return String(n || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim(); }
// A real product barcode (UPC/EAN), not an in-store random-weight or short PLU code.
function barcodeKey(sku) {
  const s = String(sku || '').trim();
  if (!/^\d{8,14}$/.test(s)) return null;
  const z = s.replace(/^0+/, '');
  if (z.length < 7) return null;
  if (/^2\d{10}$/.test(s) || /^02\d{10}$/.test(s)) return null; // random weight
  return z;
}

async function collectMcg(st) {
  const out = []; let pages = 1; let total = null;
  for (let p = 1; p <= Math.min(pages, MAX_PAGES); p++) {
    const url = `${st.site}/proxy-api/AjaxFilter/JsonProductsList?pageNumber=${p}&q=*&filterMode=00000000&storeId=${st.storeId}`;
    const r = await politeFetch(url, { method: 'POST', expectJson: true, headers: { Cookie: `MCG.store=${st.storeId}`, 'X-Requested-With': 'XMLHttpRequest' } }, DELAY);
    if (!r.ok) throw new Error(`HTTP ${r.status} page ${p}`);
    const j = await r.json();
    if (p === 1) { total = j.productsCount; pages = (j.pager && j.pager.LastIndex) || 1; }
    const list = JSON.parse(j.productsJson || '[]');
    if (!list.length) break;
    for (const x of list) {
      const price = typeof x.P_v === 'number' ? x.P_v : parsePrice(x.P);
      if (!price || price <= 0 || price > 2000) continue;
      if (x.Active === 'False') continue;
      const was = parsePrice(x.O);
      out.push({ n: cleanName(x.N), p: price, w: was && was > price ? was : null, u: unitOf(x.P), id: x.Id, b: barcodeKey(x.SKU), sp: !!x.SP });
    }
  }
  return { items: out, total, pages };
}

const started = new Date();
const results = {};
// One worker per site host, so two stores on one site never hit it at once.
const byHost = new Map();
for (const st of cfg.stores) { const h = new URL(st.site).host; if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(st); }
await Promise.all([...byHost.values()].map(async (group) => {
  for (const st of group) {
    const t0 = Date.now();
    if (st.platform !== 'mcg') {
      // Mobilezuz-type stores: try once, politely; they answered honest robots with a Cloudflare bot check in testing.
      let status = 'blocked', note = 'This store blocks robots (bot check). Search on the store instead.';
      if (st.retailerId && st.branchId) {
        try {
          const r = await politeFetch(`${st.site}/v2/retailers/${st.retailerId}/branches/${st.branchId}/products?appId=4&from=0&size=60&query=milk&languageId=2`, { expectJson: true }, DELAY);
          if (r.ok) { status = 'answered'; note = 'Answered the robot; adapter not enabled yet.'; }
        } catch (e) { note = (e.blocked ? 'Blocked: ' : 'Error: ') + e.message; }
      }
      results[st.id] = { status, note, items: [], checked: new Date().toISOString() };
      console.log(`${st.id}: ${status} (${note})`);
      continue;
    }
    try {
      const r = await collectMcg(st);
      results[st.id] = { status: 'ok', items: r.items, total: r.total, checked: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000) };
      console.log(`${st.id}: ${r.items.length} items (${r.pages} pages) in ${results[st.id].secs}s`);
    } catch (e) {
      results[st.id] = { status: e.blocked ? 'blocked' : 'error', note: e.message, items: [], checked: new Date().toISOString() };
      console.log(`${st.id}: ${results[st.id].status}: ${e.message}`);
    }
  }
}));

// Keep the previous good data for a store that failed this run, marked with its older timestamp.
let prev = null;
try { prev = JSON.parse(await fs.readFile(path.join(ROOT, 'data/groceries.json'), 'utf8')); } catch {}

const stores = cfg.stores.map((st) => ({ id: st.id, name: st.name, city: st.city, site: st.site, base: st.seo ? `${st.site}/${st.seo}` : st.site, search: st.seo ? `${st.site}/${st.seo}/search/query={q}` : null }));
const sIndex = Object.fromEntries(stores.map((s, i) => [s.id, i]));
const items = new Map(); // key -> {n, u, offers: [[storeIdx, price, was, productId]]}
let reused = 0;
for (const st of cfg.stores) {
  const r = results[st.id]; const si = sIndex[st.id]; const meta = stores[si];
  meta.status = r.status; meta.note = r.note || null; meta.checked = r.checked; meta.count = r.items.length;
  let list = r.items;
  if (r.status !== 'ok' && prev) {
    const ps = prev.stores.find((s) => s.id === st.id);
    if (ps && ps.count && ps.checked) {
      const pi = prev.stores.indexOf(ps);
      list = prev.items.flatMap((it) => it[2].filter((o) => o[0] === pi).map((o) => ({ n: it[0], u: it[1], p: o[1], w: o[2], id: o[3], b: it[3] || null })));
      meta.checked = ps.checked; meta.count = list.length; meta.stale = true; reused++;
    }
  }
  for (const x of list) {
    const key = x.b ? 'b' + x.b : `s${si}:${x.id}`;
    let it = items.get(key);
    if (!it) { it = { n: x.n, u: x.u, b: x.b || null, offers: [] }; items.set(key, it); }
    if (!it.offers.some((o) => o[0] === si)) it.offers.push([si, x.p, x.w || 0, x.id]);
    if (x.n.length > it.n.length && x.n.length < 90) it.n = x.n; // keep the most descriptive name
  }
}
const arr = [...items.values()].map((it) => { it.offers.sort((a, b) => a[1] - b[1]); return [it.n, it.u, it.offers, it.b || 0]; });
arr.sort((a, b) => b[2].length - a[2].length || a[0].localeCompare(b[0]));
const ok = stores.filter((s) => s.status === 'ok').length;
const out = {
  updated: new Date().toISOString(), started: started.toISOString(),
  note: "Prices read from each store's own online catalog by the RealLow robot. Online prices can differ from in-store. Format: items = [name, unit, offers=[[storeIndex, price, wasPrice(0=none), storeProductId]], barcode].",
  stores, items: arr,
  stats: { stores_ok: ok, stores_total: stores.length, items: arr.length, rows: arr.reduce((n, a) => n + a[2].length, 0), multi_store_items: arr.filter((a) => a[2].length > 1).length, reused_stores: reused },
};
if (ok === 0 && prev) { console.log('No store answered this run; keeping the previous file untouched.'); process.exit(0); }
await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'data/groceries.json'), serializeGroceries(out));
console.log('groceries:', JSON.stringify(out.stats));
