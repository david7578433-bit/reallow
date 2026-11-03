// eBay Browse API adapter (disabled until keys exist).
// Secrets (GitHub Actions secrets, never in the repo): EBAY_CLIENT_ID, EBAY_CLIENT_SECRET. Optional EBAY_CAMPAIGN_ID (eBay Partner Network) for affiliate links.
export const name = 'eBay';
export const enabled = () => !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
async function token() {
  const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope' });
  if (!r.ok) throw new Error('eBay token HTTP ' + r.status);
  return (await r.json()).access_token;
}
export async function search(terms) {
  const t = await token(); const out = [];
  const headers = { Authorization: `Bearer ${t}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' };
  if (process.env.EBAY_CAMPAIGN_ID) headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${process.env.EBAY_CAMPAIGN_ID}`;
  for (const q of terms) {
    const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=50&filter=buyingOptions:{FIXED_PRICE},conditions:{NEW}`, { headers });
    if (!r.ok) { console.log('eBay', q, 'HTTP', r.status); continue; }
    for (const it of (await r.json()).itemSummaries || []) {
      const price = Number(it.price && it.price.value); if (!price) continue;
      out.push({ title: it.title, price, store: 'eBay', url: it.itemAffiliateWebUrl || it.itemWebUrl, q, src: 'eBay API' });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}
