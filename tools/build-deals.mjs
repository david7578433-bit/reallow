// Refresh helper: node tools/build-deals.mjs  -> rewrites site/deals.js from site/deals.json (and groceries).
import fs from "node:fs";
const site = new URL("../", import.meta.url);
const d = JSON.parse(fs.readFileSync(new URL("deals.json", site), "utf8"));
fs.writeFileSync(new URL("deals.js", site), "window.REALLOW_DEALS = " + JSON.stringify(d) + ";\n");
if (fs.existsSync(new URL("groceries.json", site))) {
  const g = JSON.parse(fs.readFileSync(new URL("groceries.json", site), "utf8"));
  fs.writeFileSync(new URL("groceries.js", site), "window.REALLOW_GROCERIES = " + JSON.stringify(g) + ";\n");
}
console.log("deals.js rebuilt:", d.deals.length, "deals");
