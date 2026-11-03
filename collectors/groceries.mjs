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
// MERGE_ONLY=1: don't re-read the My Cloud Grocer stores; keep their last run's prices (with their own "checked" times)
// and only merge in fresh data/browser/ files. Used by the browser-merge workflow after a real-browser run.
const MERGE_ONLY = process.env.MERGE_ONLY === '1';
const BROWSER_STALE_MS = 3 * 24 * 3600 * 1000;

// Mobilezuz-type stores (Refresh, Shlomie's, Evergreen, Wesley, Hatzlacha, Kahan's) block simple robots with a bot check.
// Their prices are read in a real browser (reallow-browser-collector) and committed as data/browser/*.json.
async function loadBrowserStore(id) {
  let idx; try { idx = JSON.parse(await fs.readFile(path.join(ROOT, 'data/browser/index.json'), 'utf8')); } catch { return null; }
  const s = idx.stores && idx.stores[id]; if (!s || s.status !== 'ok' || !s.files || !s.files.length) return null;
  const items = [];
  for (const f of s.files) {
    const j = JSON.parse(await fs.readFile(path.join(ROOT, 'data/browser', f), 'utf8'));
    // row: [name, size, regularPrice, salePrice(0=none), catalogProductId, unit, imagePath, saleText]
    for (const r of j.items) {
      const [name, size, reg, sale, pid, unit] = r;
      const hasSize = size && sizeOf(name) === null;
      items.push({ n: cleanName(hasSize ? `${name}, ${size}` : name), own: name, size: size || null, p: sale || reg, w: sale ? reg : null, u: unit || '', id: pid, b: null, mz: true });
    }
  }
  return { items, checked: s.checked, count: items.length };
}
// Name + size key used to match a browser-read item to a barcode item from another store (no barcodes on those stores).
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|ounces?|lbs?|pounds?|kg|grams?|gr|g|ml|liters?|litres?|ltr|l|ct|count|pk|pack)\b\.?/gi;
function sizeOf(name) {
  const m = [...String(name || '').matchAll(SIZE_RE)]; if (!m.length) return null;
  const x = m[m.length - 1]; let u = x[2].toLowerCase().replace(/[.\s]/g, '');
  u = /^(floz|oz|ounces?)$/.test(u) ? 'oz' : /^(lbs?|pounds?)$/.test(u) ? 'lb' : /^(g|gr|grams?)$/.test(u) ? 'g' : /^(l|ltr|liters?|litres?)$/.test(u) ? 'l' : /^(ct|count)$/.test(u) ? 'ct' : /^(pk|pack)$/.test(u) ? 'pk' : u;
  return { v: String(Number(x[1])), u, raw: x[0] };
}
function nameKey(name, size) {
  const s = sizeOf(size || name); if (!s) return null;
  let n = String(name || ''); if (!size) n = n.replace(s.raw, ' '); n = n.replace(SIZE_RE, ' ');
  const toks = n.toLowerCase().replace(/&/g, ' and ').replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((t) => t && !['the', 'of', 'and', 'with', 'a'].includes(t));
  if (toks.length < 2) return null;
  return toks.sort().join(' ') + '|' + s.v + s.u;
}

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

// LocalExpress stores (e.g. Chestnut): the store's own public catalog JSON. The site hands every visitor an
// anonymous session cookie (whoami); the robot takes one per run like any shopper's browser. Barcodes (UPC) included.
async function collectLx(st) {
  const api = `${st.site}/rest-proxy/v2`;
  const w = await politeFetch(`${api}/whoami?anonymous=1`, { expectJson: true }, DELAY);
  if (!w.ok) throw new Error(`HTTP ${w.status} whoami`);
  const ck = (w.headers.getSetCookie ? w.headers.getSetCookie() : [w.headers.get('set-cookie') || '']).map((c) => c.split(';')[0]).filter(Boolean).join('; ');
  const H = { Cookie: ck, 'Content-Type': 'application/json', Accept: 'application/json' };
  const dr = await politeFetch(`${api}/layout/stores/${st.storeId}/departments?storeId=${st.storeId}&fields=id%2Ctitle%2Cslug&mode=pickup`, { expectJson: true, headers: H }, DELAY);
  if (!dr.ok) throw new Error(`HTTP ${dr.status} departments`);
  const deps = (await dr.json()).data || [];
  const seen = new Map(); let total = 0, pages = 0;
  for (const d of deps) {
    for (let p = 1; p <= 200; p++) {
      const r = await politeFetch(`${api}/layout/stores/${st.storeId}/products?mode=pickup&page=${p}&perPage=100`, { method: 'POST', expectJson: true, headers: H, body: JSON.stringify({ departmentId: String(d.id) }) }, DELAY);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${d.slug} page ${p}`);
      const j = (await r.json()).data || {}; pages++;
      const meta = j._meta || {}; if (p === 1) total += meta.totalCount || 0;
      for (const x of j.result || []) {
        if (x.hidePrice || x.is_instock === false) continue;
        const price = Number(x.priceFullDecimal); if (!(price > 0 && price < 2000)) continue;
        const was = Number(x.priceBeforeDiscountDecimal);
        const tail = String(x.productPageUrl || '').split('/product/')[1] || x.id;
        const size = x.volume && x.volumeUnits && !/\d\s*(oz|lb|fl|ct|g|kg|ml|l|pk|pack|count)\b/i.test(x.title || '') ? `, ${x.volume} ${x.volumeUnits}` : '';
        const u = x.priceUnits && x.priceUnits !== 'each' ? String(x.priceUnits).toLowerCase() : '';
        if (!seen.has(tail)) seen.set(tail, { n: cleanName(`${x.title || ''}${size}`), p: price, w: was > price ? was : null, u, id: tail, b: barcodeKey(x.upc), sp: was > price });
      }
      if (!(j.result || []).length || p >= (meta.pageCount || 1)) break;
    }
  }
  return { items: [...seen.values()], total, pages };
}

// Algolia-search stores (Grand Food Market, Monroe/KJ): the store's own public product search — the same search its
// shoppers' browsers call. The public search-only key is read from the store's own web page on every run and never
// stored in this repo. Algolia hands out at most 1000 hits per query, so the catalog is read one department at a time,
// and a department over 1000 items one subcategory (then brand) at a time. Barcodes (UPC) included.
async function algoliaCreds(st) {
  const home = await politeFetch(st.site + '/', {}, DELAY);
  if (!home.ok) throw new Error(`HTTP ${home.status} home page`);
  const html = await home.text();
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\s]+?\.js(?:\?[^"'\s]*)?/g)].map((m) => m[0]))]
    .sort((a, b) => (/layout/.test(b) ? 1 : 0) - (/layout/.test(a) ? 1 : 0));
  for (const c of chunks) {
    const r = await politeFetch(st.site + c, {}, 400); if (!r.ok) continue;
    const t = await r.text();
    const m = t.match(/algolia:\{appId:"([A-Za-z0-9]+)",searchKey:"([A-Za-z0-9]+)"[\s\S]{0,200}?indexName:[^}]*?"([A-Za-z0-9_\-]+)"\}/);
    if (m) return { app: m[1], key: m[2], index: m[3] };
  }
  throw new Error('could not find the store\'s public search settings on its page');
}
async function collectAlgolia(st) {
  const c = await algoliaCreds(st);
  const url = `https://${c.app}-dsn.algolia.net/1/indexes/${encodeURIComponent(c.index)}/query`;
  const H = { 'X-Algolia-Application-Id': c.app, 'X-Algolia-API-Key': c.key, 'Content-Type': 'application/json', Origin: st.site, Referer: st.site + '/' };
  let pages = 0;
  const q = async (body) => {
    const r = await politeFetch(url, { method: 'POST', expectJson: true, headers: H, body: JSON.stringify({ query: '', attributesToHighlight: [], attributesToSnippet: [], ...body }) }, DELAY);
    if (!r.ok) throw new Error(`HTTP ${r.status} search`);
    pages++; return r.json();
  };
  const total = (await q({ hitsPerPage: 0 })).nbHits;
  const seen = new Map();
  const take = (h) => {
    const price = Number(h.unitPrice); if (!(price > 0 && price < 2000)) return;
    const was = Number(h.comparePrice);
    const code = String(h.itemCode || '').trim();
    const sz = h.size && h.unit ? `${h.size} ${String(h.unit).replace(/\.$/, '')}` : '';
    let n = [h.brand && !String(h.name || '').toLowerCase().includes(String(h.brand).toLowerCase()) ? h.brand : '', h.name].filter(Boolean).join(' ');
    if (sz && !/\d\s*(oz|lb|fl|ct|g|kg|ml|l|pk|pack|count)\b/i.test(n)) n += `, ${sz}`;
    const id = /^\d{4,14}$/.test(code) ? code : encodeURIComponent(String(h.name || h.objectID));
    const key = h.objectID || id;
    if (!seen.has(key)) seen.set(key, { n: cleanName(n), p: price, w: was > price ? was : null, u: h.byMeasure ? 'lb' : '', id, b: barcodeKey(code), sp: was > price });
  };
  const pull = async (filters) => {
    for (let p = 0; p < 50; p++) {
      const j = await q({ filters, hitsPerPage: 1000, page: p });
      for (const h of j.hits || []) take(h);
      if (p + 1 >= (j.nbPages || 1)) break;
    }
  };
  // Price bands: split [lo, hi) in half until each band holds at most 1000 items (prices are in cents, so a band
  // narrower than a cent is one price; such a band over 1000 is read one department at a time).
  const band = async (lo, hi) => {
    const f = `unitPrice >= ${lo} AND unitPrice < ${hi}`;
    const j = await q({ filters: f, hitsPerPage: 0, ...(hi - lo < 0.02 ? { facets: ['departmentIds'], maxValuesPerFacet: 1000 } : {}) });
    if (!j.nbHits) return;
    if (j.nbHits <= 1000) return pull(f);
    if (hi - lo < 0.02) { for (const d of Object.keys((j.facets || {}).departmentIds || {})) await pull(`${f} AND departmentIds:"${d}"`); return; }
    const mid = Math.round(((lo + hi) / 2) * 100) / 100;
    await band(lo, mid); await band(mid, hi);
  };
  await band(0, 2000);
  return { items: [...seen.values()], total, pages };
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
    if (st.platform !== 'mcg' && st.platform !== 'lx' && st.platform !== 'algolia') {
      const bd = await loadBrowserStore(st.id).catch((e) => { console.log(`${st.id}: browser data unreadable: ${e.message}`); return null; });
      if (bd) {
        const stale = Date.now() - Date.parse(bd.checked) > BROWSER_STALE_MS;
        results[st.id] = { status: 'ok', via: 'browser', items: bd.items, checked: bd.checked, stale, note: 'Read in a real browser (this store blocks simple robots).' };
        console.log(`${st.id}: ${bd.items.length} items from the real-browser run of ${bd.checked}${stale ? ' (older than 3 days)' : ''}`);
        continue;
      }
      if (MERGE_ONLY) { results[st.id] = { status: 'blocked', note: 'This store blocks robots (bot check). Search on the store instead.', items: [], checked: new Date().toISOString() }; continue; }
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
    if (MERGE_ONLY) { results[st.id] = { status: 'reuse', items: [], checked: null }; continue; }
    try {
      const r = st.platform === 'lx' ? await collectLx(st) : st.platform === 'algolia' ? await collectAlgolia(st) : await collectMcg(st);
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

const stores = cfg.stores.map((st) => ({ id: st.id, name: st.name, city: st.city, site: st.site, base: st.seo ? `${st.site}/${st.seo}` : st.site, search: st.seo ? `${st.site}/${st.seo}/search/query={q}` : null,
  ...(st.platform === 'mobilezuz' ? { product: `${st.site}/?catalogProduct={id}` } : {}),
  ...(st.searchUrl ? { search: st.searchUrl } : {}), ...(st.productUrl ? { product: st.productUrl } : {}) }));
const sIndex = Object.fromEntries(stores.map((s, i) => [s.id, i]));
const items = new Map(); // key -> {n, u, offers: [[storeIdx, price, was, productId, nameMatched?, storesOwnName?]]}
let nameIndex = null;
let reused = 0;
for (const st of cfg.stores) {
  const r = results[st.id]; const si = sIndex[st.id]; const meta = stores[si];
  meta.status = r.status; meta.note = r.note || null; meta.checked = r.checked; meta.count = r.items.length;
  if (r.via) meta.via = r.via; if (r.stale) meta.stale = true;
  let list = r.items;
  if (r.status === 'reuse') { meta.status = 'blocked'; meta.note = 'No previous run to reuse.'; }
  if (r.status !== 'ok' && prev) {
    const ps = prev.stores.find((s) => s.id === st.id);
    if (ps && ps.count && ps.checked) {
      const pi = prev.stores.indexOf(ps);
      list = prev.items.flatMap((it) => it[2].filter((o) => o[0] === pi).map((o) => ({ n: it[0], u: it[1], p: o[1], w: o[2], id: o[3], b: it[3] || null })));
      meta.checked = ps.checked; meta.count = list.length; reused++;
      if (r.status === 'reuse' && ps.status === 'ok') { meta.status = 'ok'; meta.note = null; if (ps.stale) meta.stale = true; } else meta.stale = true;
    }
  }
  if (list.some((x) => x.mz) && !nameIndex) {
    // Built once, from the barcode stores' items: name+size -> item key (ambiguous keys are dropped, never guessed).
    nameIndex = new Map();
    for (const [k, it] of items) { if (!it.b) continue; const nk = nameKey(it.n); if (!nk) continue; nameIndex.set(nk, nameIndex.has(nk) && nameIndex.get(nk) !== k ? null : k); }
  }
  for (const x of list) {
    let key = x.b ? 'b' + x.b : `s${si}:${x.id}`, byName = false;
    if (x.mz) {
      key = 'm' + x.id; // same catalog product across the Mobilezuz-type stores
      if (!items.has(key) && !x.u) { const nk = nameKey(x.own || x.n, x.size); const hit = nk && nameIndex.get(nk); if (hit) { key = hit; byName = true; } }
      else if (items.has(key) && items.get(key).alias) { key = items.get(key).alias; byName = true; }
    }
    let it = items.get(key);
    if (!it) { it = { n: x.n, u: x.u, b: x.b || null, offers: [] }; items.set(key, it); }
    if (byName && !items.has('m' + x.id)) items.set('m' + x.id, { alias: key });
    if (!it.offers.some((o) => o[0] === si)) it.offers.push(byName ? [si, x.p, x.w || 0, x.id, 1, x.own || x.n] : [si, x.p, x.w || 0, x.id]);
    if (!byName && !x.mz && x.n.length > it.n.length && x.n.length < 90) it.n = x.n; // keep the most descriptive name
  }
}
const arr = [...items.values()].filter((it) => !it.alias).map((it) => { it.offers.sort((a, b) => a[1] - b[1]); return [it.n, it.u, it.offers, it.b || 0]; });
arr.sort((a, b) => b[2].length - a[2].length || a[0].localeCompare(b[0]));
const ok = stores.filter((s) => s.status === 'ok').length;
const out = {
  updated: new Date().toISOString(), started: started.toISOString(),
  note: "Prices read from each store's own online catalog by the RealLow robot (stores that block simple robots are read in a real browser). Online prices can differ from in-store. Format: items = [name, unit, offers=[[storeIndex, price, wasPrice(0=none), storeProductId, nameMatched(1 = matched to this item by name+size, not barcode), storesOwnName]], barcode].",
  stores, items: arr,
  stats: { stores_ok: ok, stores_total: stores.length, items: arr.length, rows: arr.reduce((n, a) => n + a[2].length, 0), multi_store_items: arr.filter((a) => a[2].length > 1).length, reused_stores: reused, name_matched_offers: arr.reduce((n, a) => n + a[2].filter((o) => o[4]).length, 0), merge_only: MERGE_ONLY },
};
if (ok === 0 && prev) { console.log('No store answered this run; keeping the previous file untouched.'); process.exit(0); }
await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'data/groceries.json'), serializeGroceries(out));
console.log('groceries:', JSON.stringify(out.stats));
