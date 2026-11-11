// eBay Browse API adapter. Live since Nov 11 2026 (production keyset "RealLow", app token only, no eBay user data stored:
// eBay granted the Marketplace Account Deletion exemption "I do not persist eBay data").
// Secrets (GitHub Actions secrets, never in the repo): EBAY_CLIENT_ID, EBAY_CLIENT_SECRET. Optional EBAY_CAMPAIGN_ID (eBay Partner Network) for affiliate links.
// Three outputs, every one a real price read from eBay at run time:
//   search(terms)   -> offers for RealLow's search (cheapest NEW listings from well-rated US sellers per term)
//   deals(cfg)      -> "Top deals today": NEW items whose eBay listing shows a real discount vs list / was price
//   matches(cfg)    -> the same items RealLow's Online deals list, priced on eBay
import fs from 'node:fs';
import path from 'node:path';
export const name = 'eBay';
export const enabled = () => !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Clean deals only: no holiday junk, nothing immodest, no used / parts / empty-box tricks.
const BAD = /\b(hallowe+n|christmas|xmas|easter|valentine|santa|costume|lingerie|bikini|swim\s?suit|swimwear|bra|bras|panties|thong|sexy|dress|dresses|women'?s|womens|ladies|girls?|leggings|yoga pants|makeup|cosmetic|perfume|for parts|not working|read description|empty box|box only|case only|replacement|refurbished|renewed|used|open box|pre-?owned|lot of|wholesale|bulk lot|skin|decal|sticker|tarot|zodiac|crucifix|rosary|bible|buddha|wine|beer|liquor|vodka|whiskey|cannabis|vape|cbd|hookah|gun|ammo|tattoo|bodycon|box damage|damaged|dented|scratch and dent|bayonetta|mortal kombat|grand theft|gta)\b/i;
let TOKEN = null, CALLS = 0;
async function token() {
  if (TOKEN) return TOKEN;
  const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope' });
  if (!r.ok) throw new Error('eBay token HTTP ' + r.status);
  return (TOKEN = (await r.json()).access_token);
}
async function find(q, limit = 50) {
  const headers = { Authorization: `Bearer ${await token()}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' };
  if (process.env.EBAY_CAMPAIGN_ID) headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${process.env.EBAY_CAMPAIGN_ID},affiliateReferenceId=reallow`;
  const filter = 'buyingOptions:{FIXED_PRICE},conditionIds:{1000},itemLocationCountry:US,deliveryCountry:US,priceCurrency:USD';
  for (let a = 1; a <= 3; a++) {
    CALLS++;
    const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${limit}&filter=${encodeURIComponent(filter)}`, { headers });
    if (r.ok) { await sleep(250); return (await r.json()).itemSummaries || []; }
    console.log('eBay', q, 'HTTP', r.status); if (r.status < 500 && r.status !== 429) return []; await sleep(2000 * a);
  }
  return [];
}
const low = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ');
function trusted(it, minScore) {
  const s = it.seller || {}; const fp = Number(s.feedbackPercentage), fs_ = Number(s.feedbackScore);
  return fp >= 98.5 && fs_ >= minScore && !it.adultOnly && !BAD.test(it.title || '') && Number(it.price && it.price.value) >= 5;
}
function cleanUrl(it) {
  if (it.itemAffiliateWebUrl) return it.itemAffiliateWebUrl;
  const id = it.legacyItemId || (String(it.itemId).split('|')[1]);
  return id ? `https://www.ebay.com/itm/${id}` : it.itemWebUrl;
}
const TREAT = { LIST_PRICE: 'List price', MINIMUM_ADVERTISED_PRICE: 'Regular price', STRIKETHROUGH: 'Was', MARKDOWN: 'Was' };
function offer(it, extra = {}) {
  const price = Number(it.price.value); const mp = it.marketingPrice; const was = mp && mp.originalPrice ? Number(mp.originalPrice.value) : null;
  const ship = it.shippingOptions && it.shippingOptions[0] && it.shippingOptions[0].shippingCost ? Number(it.shippingOptions[0].shippingCost.value) : null;
  const o = { id: 'ebay-' + (it.legacyItemId || it.itemId), title: it.title, store: 'eBay', seller: it.seller && it.seller.username, price, url: cleanUrl(it), src: 'eBay API' };
  if (was && was > price) { o.was = was; o.was_label = TREAT[mp.priceTreatment] || 'Was'; o.pct_off = Math.round((1 - price / was) * 100); }
  if (ship === 0) o.free_ship = true; else if (ship > 0) o.ship = ship;
  return { ...o, ...extra };
}
export async function search(terms) {
  const out = [];
  for (const q of terms) {
    const words = low(q).split(' ').filter((w) => w.length > 2);
    const its = (await find(q)).filter((it) => trusted(it, 500) && words.every((w) => low(it.title).includes(w.replace(/s$/, ''))));
    its.sort((a, b) => Number(a.price.value) - Number(b.price.value));
    // skip the very cheapest oddities (accessories): keep listings at least 35% of the median price for that term
    const med = its.length ? Number(its[Math.floor(its.length / 2)].price.value) : 0;
    its.filter((it) => Number(it.price.value) >= med * 0.35).slice(0, 4).forEach((it) => out.push(offer(it, { q })));
  }
  return out;
}
export async function deals(cfg) {
  const all = []; const seen = new Set();
  for (const d of cfg.queries) {
    for (const it of await find(d.q)) {
      const mp = it.marketingPrice; if (!mp || !mp.originalPrice || !trusted(it, cfg.min_seller_feedback || 5000)) continue;
      if (d.require && !d.require.every((w) => low(it.title).includes(w))) continue;
      const o = offer(it, { cat: d.cat, q: d.q });
      if (!o.pct_off || o.pct_off < (cfg.min_pct_off || 20) || o.pct_off > 75 || o.was - o.price < 5) continue;
      const key = low(o.title).slice(0, 48); if (seen.has(key)) continue; seen.add(key);
      o.score = o.pct_off * Math.log10(10 + (o.was - o.price)); all.push(o);
    }
  }
  all.sort((a, b) => b.score - a.score);
  // variety: at most 3 per search and 4 per seller
  const per = {}, perS = {}, top = [];
  for (const o of all) { if ((per[o.q] || 0) >= 3 || (perS[o.seller] || 0) >= 4) continue; per[o.q] = (per[o.q] || 0) + 1; perS[o.seller] = (perS[o.seller] || 0) + 1; top.push(o); if (top.length >= (cfg.max || 40)) break; }
  return top.map(({ score, ...o }) => o);
}
export async function matches(cfg) {
  const out = [];
  for (const m of cfg.matches) {
    const its = (await find(m.q)).filter((it) => trusted(it, 300) && m.require.every((w) => low(it.title).includes(w)) && !(m.exclude || []).some((w) => low(it.title).includes(w)));
    if (!its.length) continue;
    its.sort((a, b) => Number(a.price.value) - Number(b.price.value));
    out.push(offer(its[0], { for_id: m.for_id, for_title: m.for_title || null, q: m.q, listings: its.length }));
  }
  return out;
}
export const calls = () => CALLS;
