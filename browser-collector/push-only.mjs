// Push whatever is in export/ (no collecting), merge, verify. Used for testing / re-pushing.
import path from "node:path"; import fs from "node:fs";
const DIR = path.dirname(new URL(import.meta.url).pathname);
const { pushExport, checkLive } = await import(path.join(DIR, "push.mjs"));
const idx = JSON.parse(fs.readFileSync(path.join(DIR, "export", "index.json"), "utf8"));
const ok = Object.entries(idx.stores).filter(([, v]) => v.status === "ok").map(([k]) => k);
const p = await pushExport({ message: `Browser prices: ${ok.join(", ")} (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)` });
fs.copyFileSync(path.join(DIR, "export", "index.json"), path.join(DIR, "last-index.json"));
console.log(JSON.stringify(p)); console.log(JSON.stringify(await checkLive(ok)));
