// Rakuten Advertising product search adapter. Disabled until keys exist.
// Secrets: RAKUTEN_CLIENT_ID, RAKUTEN_CLIENT_SECRET, RAKUTEN_SID (site id / scope).
export const name = 'Rakuten Advertising';
export const enabled = () => !!(process.env.RAKUTEN_CLIENT_ID && process.env.RAKUTEN_CLIENT_SECRET && process.env.RAKUTEN_SID);
async function token() {
  const basic = Buffer.from(`${process.env.RAKUTEN_CLIENT_ID}:${process.env.RAKUTEN_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://api.linksynergy.com/token', { method: 'POST', headers: { Authorization: `Bearer ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `scope=${process.env.RAKUTEN_SID}` });
  if (!r.ok) throw new Error('Rakuten token HTTP ' + r.status);
  return (await r.json()).access_token;
}
export async function search(terms) {
  const t = await token(); const out = [];
  for (const q of terms) {
    const r = await fetch(`https://api.linksynergy.com/productsearch/1.0?keyword=${encodeURIComponent(q)}&max=50`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) continue;
    const xml = await r.text();
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const g = (k) => ((m[1].match(new RegExp(`<${k}[^>]*>([\\s\\S]*?)</${k}>`)) || [])[1] || '').trim();
      const price = Number(g('saleprice') || g('price')); if (!price) continue;
      out.push({ title: g('productname'), price, store: g('merchantname'), url: g('linkurl'), q, src: 'Rakuten API' });
    }
  }
  return out;
}
