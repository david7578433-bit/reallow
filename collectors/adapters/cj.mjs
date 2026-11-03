// CJ Affiliate product feed adapter (GraphQL product search). Disabled until keys exist.
// Secrets: CJ_PERSONAL_TOKEN, CJ_COMPANY_ID (publisher CID), CJ_WEBSITE_ID (PID, for links).
export const name = 'CJ Affiliate';
export const enabled = () => !!(process.env.CJ_PERSONAL_TOKEN && process.env.CJ_COMPANY_ID);
export async function search(terms) {
  const out = [];
  for (const q of terms) {
    const query = `{ products(companyId: "${process.env.CJ_COMPANY_ID}", keywords: [${JSON.stringify(q)}], limit: 50${process.env.CJ_WEBSITE_ID ? '' : ''}) { resultList { title price { amount currency } salePrice { amount } advertiserName link ${process.env.CJ_WEBSITE_ID ? `linkCode(pid: "${process.env.CJ_WEBSITE_ID}") { clickUrl }` : ''} } } }`;
    const r = await fetch('https://ads.api.cj.com/query', { method: 'POST', headers: { Authorization: `Bearer ${process.env.CJ_PERSONAL_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    if (!r.ok) { console.log('CJ', q, 'HTTP', r.status); continue; }
    const list = (((await r.json()).data || {}).products || {}).resultList || [];
    for (const it of list) {
      const price = Number((it.salePrice && it.salePrice.amount) || (it.price && it.price.amount)); if (!price) continue;
      out.push({ title: it.title, price, was: it.salePrice ? Number(it.price.amount) : null, store: it.advertiserName, url: (it.linkCode && it.linkCode.clickUrl) || it.link, q, src: 'CJ API' });
    }
  }
  return out;
}
