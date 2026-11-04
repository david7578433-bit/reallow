// Turns out/<store>.json (full browser capture) into the repo's compact files: data/browser/<store>-<n>.json + index.json.
// Row: [name, size, regularPrice, salePrice(0=none), catalogProductId, unit('' or per-unit like 'lb'), imagePath, saleText]
import fs from "node:fs"; import path from "node:path";
const DIR = path.dirname(new URL(import.meta.url).pathname);
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, "stores.json"), "utf8"));
const OUT = path.join(DIR, "export"); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const PER_FILE = Number(process.env.RL_PER_FILE || 3000);
const IMG = "https://d226b0iufwcjmj.cloudfront.net/product-images/";
let prevIndex = {}; try { prevIndex = JSON.parse(fs.readFileSync(path.join(DIR, "last-index.json"), "utf8")); } catch {}
const index = { updated: new Date().toISOString(), note: "Prices read in a real browser from each store's own online catalog (these stores block simple robots). Rows: [name, size, regularPrice, salePrice(0=none), catalogProductId, unit, imagePath (after " + IMG + "), saleText]. Product page: {site}/?catalogProduct={id}.", stores: {} };
for (const st of CFG.stores) {
  let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(DIR, "out", `${st.id}.json`), "utf8")); } catch {}
  if (!rec || rec.status !== "ok") {
    // Failed this run: keep the last good files (they stay in the repo) with their own older "checked" time.
    const old = prevIndex.stores && prevIndex.stores[st.id];
    index.stores[st.id] = old && old.status === "ok" ? { ...old, last_attempt: rec ? rec.checked : null, last_attempt_status: rec ? rec.status : "not run", last_attempt_note: rec ? rec.note || null : null }
                                                     : { name: st.name, city: st.city, site: st.site, status: rec ? rec.status : "not run", note: rec ? rec.note || null : null, checked: rec ? rec.checked : null, count: 0, files: [] };
    continue;
  }
  const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const full = (x) => x.brand && !squash(x.name).includes(squash(x.brand)) ? `${x.brand} ${x.name}` : x.name;
  const rows = rec.items.map((x) => [full(x), x.size || "", x.price, x.sale || 0, x.productId, x.unit || (x.weighable ? "lb" : ""), x.image && x.image.startsWith(IMG) ? x.image.slice(IMG.length) : (x.image || ""), x.saleText || ""]);
  rows.sort((a, b) => a[4] - b[4]);
  const files = [];
  for (let i = 0; i * PER_FILE < rows.length; i++) {
    const f = `${st.id}-${i}.json`; files.push(f);
    fs.writeFileSync(path.join(OUT, f), '{"store":' + JSON.stringify(st.id) + ',"checked":' + JSON.stringify(rec.checked) + ',"items":[\n' + rows.slice(i * PER_FILE, (i + 1) * PER_FILE).map((r) => JSON.stringify(r)).join(",\n") + "\n]}\n");
  }
  index.stores[st.id] = { name: st.name, city: st.city, site: st.site, status: "ok", checked: rec.checked, count: rows.length, on_sale: rows.filter((r) => r[3]).length, files };
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(index.stores).map(([k, v]) => [k, `${v.status} ${v.count} (${(v.files || []).length} files)`]))));
