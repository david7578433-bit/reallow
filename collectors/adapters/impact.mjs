// Impact product catalogs adapter (Walmart, Target and other Impact brands). Disabled until keys exist.
// Secrets: IMPACT_ACCOUNT_SID, IMPACT_AUTH_TOKEN. Optional IMPACT_CATALOG_IDS (comma list) to limit catalogs.
export const name = 'Impact (Walmart / Target)';
export const enabled = () => !!(process.env.IMPACT_ACCOUNT_SID && process.env.IMPACT_AUTH_TOKEN);
export async function search(terms) {
  const sid = process.env.IMPACT_ACCOUNT_SID; const auth = Buffer.from(`${sid}:${process.env.IMPACT_AUTH_TOKEN}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
  let catalogs = (process.env.IMPACT_CATALOG_IDS || '').split(',').filter(Boolean);
  if (!catalogs.length) {
    const r = await fetch(`https://api.impact.com/Mediapartners/${sid}/Catalogs`, { headers });
    if (!r.ok) throw new Error('Impact catalogs HTTP ' + r.status);
    catalogs = ((await r.json()).Catalogs || []).map((c) => c.Id);
  }
  const out = [];
  for (const q of terms) for (const id of catalogs) {
    const r = await fetch(`https://api.impact.com/Mediapartners/${sid}/Catalogs/${id}/Items?Keyword=${encodeURIComponent(q)}&PageSize=50`, { headers });
    if (!r.ok) continue;
    for (const it of (await r.json()).Items || []) {
      const price = Number(it.CurrentPrice); if (!price) continue;
      out.push({ title: it.Name, price, was: Number(it.OriginalPrice) || null, store: it.CampaignName || 'Impact', url: it.Url, q, src: 'Impact API' });
    }
  }
  return out;
}
