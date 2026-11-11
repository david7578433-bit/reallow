// AliExpress Affiliate API adapter (waits for keys). Keys come from AliExpress Open Platform (open.aliexpress.com,
// Affiliates API app) and live ONLY in GitHub Actions secrets: ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID.
// Uses aliexpress.affiliate.product.query (HMAC-SHA256 signed). Text only on the site; clean categories; real prices only.
import crypto from 'node:crypto';
export const name = 'AliExpress';
export const enabled = () => !!(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET && process.env.ALIEXPRESS_TRACKING_ID);
const BAD = /\b(hallowe+n|christmas|xmas|easter|valentine|santa|costume|lingerie|bikini|swim\s?suit|bra|bras|panties|thong|sexy|dress|dresses|women'?s|womens|ladies|girls?|leggings|makeup|wig|tattoo|replica|tarot|zodiac|crucifix|rosary|buddha|wine|beer|vape|cbd|hookah|gun|ammo)\b/i;
let CALLS = 0;
async function call(method, params) {
  const p = { app_key: process.env.ALIEXPRESS_APP_KEY, method, sign_method: 'sha256', timestamp: String(Date.now()), ...params };
  const base = Object.keys(p).sort().map((k) => k + p[k]).join('');
  p.sign = crypto.createHmac('sha256', process.env.ALIEXPRESS_APP_SECRET).update(base).digest('hex').toUpperCase();
  CALLS++;
  const r = await fetch('https://api-sg.aliexpress.com/sync', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, body: new URLSearchParams(p).toString() });
  if (!r.ok) throw new Error('AliExpress HTTP ' + r.status);
  return r.json();
}
async function query(q, extra = {}) {
  const j = await call('aliexpress.affiliate.product.query', { keywords: q, tracking_id: process.env.ALIEXPRESS_TRACKING_ID, target_currency: 'USD', target_language: 'EN', ship_to_country: 'US', page_size: '50', ...extra });
  const res = j.aliexpress_affiliate_product_query_response && j.aliexpress_affiliate_product_query_response.resp_result;
  if (!res) { console.log('AliExpress', q, JSON.stringify(j).slice(0, 200)); return []; }
  return (res.result && res.result.products && res.result.products.product) || [];
}
function offer(p, extra = {}) {
  const price = Number(p.target_sale_price || p.sale_price), was = Number(p.target_original_price || p.original_price);
  const o = { id: 'ali-' + p.product_id, title: p.product_title, store: 'AliExpress', seller: p.shop_name || 'AliExpress seller', price, url: p.promotion_link || p.product_detail_url, src: 'AliExpress API' };
  if (was > price) { o.was = was; o.was_label = 'Was'; o.pct_off = Math.round((1 - price / was) * 100); }
  return { ...o, ...extra };
}
const good = (p) => p.product_title && !BAD.test(p.product_title) && Number(p.target_sale_price || p.sale_price) >= 3 && parseFloat(p.evaluate_rate || '0') >= 92 && Number(p.lastest_volume || 0) >= 50;
export async function search(terms) {
  const out = [];
  for (const q of terms) { const ps = (await query(q, { sort: 'LAST_VOLUME_DESC' })).filter(good); ps.slice(0, 3).forEach((p) => out.push(offer(p, { q }))); }
  return out;
}
export async function deals(cfg) {
  const out = [], seen = new Set();
  for (const d of cfg.queries) {
    for (const p of (await query(d.q, { sort: 'LAST_VOLUME_DESC' })).filter(good)) {
      const o = offer(p, { cat: d.cat, q: d.q });
      if (!o.pct_off || o.pct_off < (cfg.min_pct_off || 30) || o.pct_off > 80 || seen.has(o.id)) continue;
      seen.add(o.id); out.push(o); if (out.filter((x) => x.q === d.q).length >= 2) break;
    }
  }
  return out.slice(0, cfg.max || 20);
}
export const calls = () => CALLS;
