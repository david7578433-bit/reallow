// Robot C: local appliance + clothing stores (RealLow v4).
// Reads each store's own PUBLIC catalog: Shopify /products.json (paged, 250 per page) or WooCommerce's public Store API.
// Polite: honest User-Agent, robots.txt respected, 1.5 s between requests to the same store, stops a store on any block.
// Writes compact files: data/shops/<store>.json (one per store) + data/shops/index.json (store list, counts, checked times).
// A store that fails keeps its last good file (shown with its older "checked" time). Never invents a price.
// Run: node collectors/shops.mjs [store-id ...]   (OUT_DIR=... to write elsewhere)
import fs from 'node:fs'; import path from 'node:path';
import { politeFetch, Blocked } from './lib/polite.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'collectors/config/shops.json'), 'utf8'));
const OUT = process.env.OUT_DIR || path.join(ROOT, 'data/shops');
const ONLY = process.argv.slice(2);
const MAX_PAGES = 100; // Shopify answers 400 past page 100 (25,000 products)
const PAR = 4;         // stores read at the same time (different sites; each site still gets 1 request per 1.5 s)
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Not shown: holiday items David asked to leave out, gift cards, and immodest items.
const SEASONAL = /\b(christmas|x-?mas|halloween|santa|easter|nativity|ornaments?|jack[- ]o[- ]lantern|trick or treat|spooky|witch(es)?|elf on the shelf|valentine)\b/i;
const NOT_PRODUCT = /\b(gift ?card|e-?gift|gift certificate|shipping protection|route protection|test product|deposit)\b/i;
const IMMODEST = /\b(bikini|lingerie|thong|bralette|bra|crop top|cropped top|tube top|strapless|backless|mini ?skirt|mini ?dress|low[- ]cut|see[- ]through|sheer top)\b/i;
const KEEP_TAG = /^(boys?|girls?|mens?|men's|womens?|women's|ladies|teens?|kids|baby|babies|infant|toddler|newborn|unisex|shoes?|sneakers?|boots?|sandals?|slippers?|dress shoes|suits?|shirts?|skirts?|dresses|pajamas|robes?|coats?|jackets?|hats?|socks|tights|layette|refrigerators?|freezers?|ranges?|ovens?|cooktops?|dishwashers?|washers?|dryers?|microwaves?|laundry|cooking|kitchen|small appliances?|vacuums?|air conditioners?|hoods?|wine coolers?|blenders?|mixers?|urns?|hot plates?|blechs?)$/i;

const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const clean = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const r = await politeFetch(url, { expectJson: true }, 1500);
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

async function readShopify(s) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let j;
    try { j = await getJson(`https://${s.domain}/products.json?limit=250&page=${page}`); }
    catch (e) { if (page > 1 && e.status === 400) break; throw e; }
    const ps = j.products || [];
    for (const p of ps) {
      const title = clean(p.title); if (!title) continue;
      const tags = (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',')).map((t) => t.trim());
      const text = title + ' ' + (p.product_type || '') + ' ' + tags.join(' ');
      if (SEASONAL.test(text) || NOT_PRODUCT.test(title)) continue;
      if (s.cat === 'clothing' && IMMODEST.test(title + ' ' + (p.product_type || ''))) continue;
      const vs = (p.variants || []).filter((v) => v.available && num(v.price) > 0);
      if (!vs.length) continue; // sold out or "call for price": not shown
      vs.sort((a, b) => num(a.price) - num(b.price));
      const v = vs[0], price = num(v.price), was = num(v.compare_at_price) > price ? num(v.compare_at_price) : 0;
      const hi = num(vs[vs.length - 1].price);
      const img = (p.images && p.images[0] && p.images[0].src) || '';
      const kw = [p.product_type || '', ...tags.filter((t) => KEEP_TAG.test(t))].map(clean).filter(Boolean);
      const sku = s.cat === 'appliances' ? String(v.sku || '').trim().slice(0, 40) : '';
      rows.push([title.slice(0, 140), price, was, p.handle, img.split('?')[0], [...new Set(kw)].join(' ').slice(0, 80), sku, hi > price ? hi : 0]);
    }
    if (ps.length < 250) break;
  }
  return rows;
}

async function readWoo(s) {
  const rows = [];
  for (let page = 1; page <= 100; page++) {
    const ps = await getJson(`https://${s.domain}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
    for (const p of ps) {
      const title = clean(p.name); if (!title || SEASONAL.test(title) || NOT_PRODUCT.test(title)) continue;
      if (p.is_in_stock === false || p.is_purchasable === false) continue;
      const pr = p.prices || {}; const minor = Number(pr.currency_minor_unit ?? 2);
      const price = num(pr.price) / 10 ** minor, reg = num(pr.regular_price) / 10 ** minor;
      if (!(price > 0)) continue;
      const model = (clean(p.short_description).match(/Model:?\s*([A-Z0-9][A-Z0-9-]{3,})/i) || [])[1] || p.sku || '';
      const img = (p.images && p.images[0] && (p.images[0].thumbnail || p.images[0].src)) || '';
      rows.push([title.slice(0, 140), Math.round(price * 100) / 100, reg > price ? Math.round(reg * 100) / 100 : 0, p.permalink, img, (p.categories || []).map((c) => clean(c.name)).join(' ').slice(0, 80), String(model).slice(0, 40), 0]);
    }
    if (ps.length < 100) break;
  }
  return rows;
}

// Shrinks image URLs: most share one long prefix per store; it is stored once.
function packImages(rows) {
  const imgs = rows.map((r) => r[4]).filter(Boolean);
  if (!imgs.length) return '';
  let pre = imgs[0];
  for (const u of imgs) { let i = 0; while (i < pre.length && i < u.length && pre[i] === u[i]) i++; pre = pre.slice(0, i); if (!pre) break; }
  pre = pre.slice(0, pre.lastIndexOf('/') + 1);
  if (pre.length < 12) return '';
  for (const r of rows) if (r[4] && r[4].startsWith(pre)) r[4] = r[4].slice(pre.length);
  return pre;
}

async function main() {
  const idxPath = path.join(OUT, 'index.json');
  const prev = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { stores: [] };
  const prevById = new Map((prev.stores || []).map((s) => [s.id, s]));
  const todo = CFG.stores.filter((s) => s.platform !== 'none' && (!ONLY.length || ONLY.includes(s.id)));
  const result = new Map();
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const s = todo[next++]; const t0 = Date.now();
      try {
        const rows = s.platform === 'woo' ? await readWoo(s) : await readShopify(s);
        if (!rows.length) throw new Error('no priced items in stock');
        rows.sort((a, b) => a[1] - b[1]);
        const img = packImages(rows);
        const checked = new Date().toISOString();
        const file = { id: s.id, checked, base: s.platform === 'woo' ? '' : `https://${s.domain}/products/`, img, cols: ['title', 'price', 'was', 'handle', 'image', 'keywords', 'model', 'price_high'], rows };
        fs.writeFileSync(path.join(OUT, s.id + '.json'), JSON.stringify(file));
        result.set(s.id, { status: 'ok', n: rows.length, checked });
        log(s.id, rows.length, 'items', ((Date.now() - t0) / 1000).toFixed(0) + 's');
      } catch (e) {
        const was = prevById.get(s.id);
        const status = e instanceof Blocked || e.blocked ? 'blocked' : 'error';
        result.set(s.id, { status: was && was.n ? 'stale' : status, n: was ? was.n || 0 : 0, checked: was ? was.checked : null, error: String(e.message || e).slice(0, 160) });
        log(s.id, 'FAILED', status, e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: PAR }, worker));
  const stores = CFG.stores.map((s) => {
    const r = result.get(s.id) || prevById.get(s.id) || {};
    const live = s.platform !== 'none' && r.n > 0;
    return { id: s.id, name: s.name, cat: s.cat, sub: s.sub, cities: s.cities, site: s.site, address: s.address, phone: s.phone, search: s.search, live, n: live ? r.n : 0, checked: live ? r.checked : null, status: s.platform === 'none' ? 'directory' : (r.status || 'pending'), ...(r.error ? { error: r.error } : {}) };
  });
  const index = { updated: new Date().toISOString(), stores, total: stores.reduce((a, s) => a + s.n, 0) };
  fs.writeFileSync(idxPath, JSON.stringify(index, null, 0));
  log('done:', index.total, 'items from', stores.filter((s) => s.live).length, 'stores with live prices;', stores.filter((s) => !s.live).length, 'directory/failed');
}
main().catch((e) => { console.error(e); process.exit(1); });
