// Amazon Creators API adapter (successor to PA-API 5). Disabled until keys exist.
// Amazon opens API access only after an Associates account has qualifying sales.
// Secrets: AMAZON_CREATORS_CREDENTIAL_ID, AMAZON_CREATORS_CREDENTIAL_SECRET, AMAZON_PARTNER_TAG (e.g. reallow-20).
// Optional AMAZON_CREATORS_VERSION (credential version from Associates Central), AMAZON_CREATORS_ENDPOINT.
export const name = 'Amazon Creators API';
export const enabled = () => !!(process.env.AMAZON_CREATORS_CREDENTIAL_ID && process.env.AMAZON_CREATORS_CREDENTIAL_SECRET && process.env.AMAZON_PARTNER_TAG);
async function token() {
  const r = await fetch(process.env.AMAZON_CREATORS_TOKEN_URL || 'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.AMAZON_CREATORS_CREDENTIAL_ID, client_secret: process.env.AMAZON_CREATORS_CREDENTIAL_SECRET, scope: 'creatorsapi/default' }),
  });
  if (!r.ok) throw new Error('Amazon token HTTP ' + r.status);
  return (await r.json()).access_token;
}
export async function search(terms) {
  const t = await token(); const out = [];
  const endpoint = process.env.AMAZON_CREATORS_ENDPOINT || 'https://creatorsapi.amazon/catalog/v1/searchItems';
  for (const q of terms) {
    const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${t}, Version ${process.env.AMAZON_CREATORS_VERSION || '2.1'}`, 'Content-Type': 'application/json', 'x-marketplace': 'www.amazon.com' },
      body: JSON.stringify({ keywords: q, partnerTag: process.env.AMAZON_PARTNER_TAG, partnerType: 'Associates', marketplace: 'www.amazon.com', itemCount: 10, resources: ['itemInfo.title', 'offersV2.listings.price'] }) });
    if (!r.ok) { console.log('Amazon', q, 'HTTP', r.status); continue; }
    const j = await r.json();
    for (const it of (j.searchResult && j.searchResult.items) || []) {
      const l = it.offersV2 && it.offersV2.listings && it.offersV2.listings[0];
      const price = l && l.price && Number(l.price.money ? l.price.money.amount : l.price.amount); if (!price) continue;
      out.push({ title: it.itemInfo && it.itemInfo.title && it.itemInfo.title.displayValue, price, store: 'Amazon', url: it.detailPageURL, q, src: 'Amazon API' });
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return out;
}
