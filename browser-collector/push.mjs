// Pushes export/ to david7578433-bit/reallow as ONE commit under data/browser/, then starts the browser-merge workflow
// and waits for it, then checks the live Pages file. Writes go through the connected GitHub account (no token on this box);
// reads use GitHub's public API (the repo is public).
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import os from "node:os"; import crypto from "node:crypto";
const DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO = "david7578433-bit/reallow";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let N = 0;
function gh(method, url, body) {
  // The connected-apps door reads request files only from the current task's directory, and answers an identical
  // request (same task, same words) from its cache — so every request carries a fresh nonce header.
  const tid = process.env.TAB_TASK_ID; if (!tid) throw new Error("TAB_TASK_ID is not set (run this from a Tab turn)");
  const f = `/home/user/tab/tasks/${tid}/reallow-gh-${process.pid}-${Date.now()}-${++N}.json`;
  fs.writeFileSync(f, JSON.stringify({ toolkit: "github", method, url, headers: { Accept: "application/vnd.github+json", "X-RealLow-Nonce": `${Date.now()}-${process.pid}-${N}` }, ...(body !== undefined ? { body } : {}) }));
  try {
    const out = execFileSync("/usr/bin/node", ["/home/user/tab/connected-apps-cli.mjs", "connected_apps.request", f], { encoding: "utf8", timeout: 180000, maxBuffer: 64e6, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "", NO_COLOR: "1" } });
    const j = JSON.parse(out.slice(out.indexOf("{"))); const r = j.result || j;
    let b = r.body; if (b === undefined && typeof r.body_head === "string") { try { b = JSON.parse(r.body_head); } catch { b = r.body_head; } }
    return { status: r.status, body: b, raw: r };
  } finally { fs.rmSync(f, { force: true }); }
}
async function pub(url) { const r = await fetch("https://api.github.com" + url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "RealLow-collector" } }); return r.json(); }

export async function pushExport({ message, dispatch = true, wait = true } = {}) {
  const exp = path.join(DIR, "export");
  const files = fs.readdirSync(exp).filter((f) => f.endsWith(".json"));
  // blobs first (one request per file), then one tree + one commit
  const entries = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(exp, f));
    let r;
    for (let a = 1; a <= 3; a++) { r = gh("POST", `/repos/${REPO}/git/blobs`, { content: content.toString("base64"), encoding: "base64" }); if (r.status === 201) break; log("blob retry", f, r.status, JSON.stringify(r.body).slice(0, 200)); await sleep(3000 * a); }
    if (r.status !== 201) throw new Error(`blob ${f}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const local = crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content])).digest("hex");
    if (r.body.sha !== local) throw new Error(`blob ${f}: GitHub stored ${r.body.sha}, expected ${local}`);
    entries.push({ path: `data/browser/${f}`, mode: "100644", type: "blob", sha: r.body.sha });
    log("blob", f, (content.length / 1024).toFixed(0) + " KB");
  }
  // remove data/browser files that this export no longer has (e.g. a store's catalog shrank by a chunk), unless the index keeps them
  const index = JSON.parse(fs.readFileSync(path.join(exp, "index.json"), "utf8"));
  const keep = new Set(["index.json", ...files, ...Object.values(index.stores).flatMap((s) => s.files || [])]);
  let commitSha;
  for (let a = 1; a <= 4; a++) {
    const ref = gh("GET", `/repos/${REPO}/git/ref/heads/main`); const head = ref.body.object.sha;
    const hc = gh("GET", `/repos/${REPO}/git/commits/${head}`); const baseTree = hc.body.tree.sha;
    const existing = await pub(`/repos/${REPO}/contents/data/browser?ref=${head}`).catch(() => []);
    const dels = Array.isArray(existing) ? existing.filter((e) => !keep.has(e.name)).map((e) => ({ path: e.path, mode: "100644", type: "blob", sha: null })) : [];
    let tree;
    for (let t = 1; t <= 4; t++) {
      tree = gh("POST", `/repos/${REPO}/git/trees`, { base_tree: baseTree, tree: [...entries, ...dels] });
      if (tree.status === 201) break;
      const bad = (JSON.stringify(tree.body).match(/tree\.sha ([0-9a-f]{40}) is not a valid blob/) || [])[1];
      log("tree refused", tree.status, bad ? `blob ${bad.slice(0, 7)} not visible yet; re-sending it` : JSON.stringify(tree.body).slice(0, 160));
      if (bad) { const e = entries.find((x) => x.sha === bad); if (e) gh("POST", `/repos/${REPO}/git/blobs`, { content: fs.readFileSync(path.join(exp, path.basename(e.path))).toString("base64"), encoding: "base64" }); }
      await sleep(5000 * t);
    }
    if (tree.status !== 201) throw new Error(`tree: HTTP ${tree.status} ${JSON.stringify(tree.body).slice(0, 200)}`);
    const c = gh("POST", `/repos/${REPO}/git/commits`, { message, tree: tree.body.sha, parents: [head] });
    if (c.status !== 201) throw new Error(`commit: HTTP ${c.status}`);
    const u = gh("PATCH", `/repos/${REPO}/git/refs/heads/main`, { sha: c.body.sha, force: false });
    if (u.status === 200) { commitSha = c.body.sha; break; }
    log("main moved under us, retrying", u.status); await sleep(5000);
  }
  if (!commitSha) throw new Error("could not update main");
  log("pushed commit", commitSha.slice(0, 7), `(${entries.length} files)`);
  if (!dispatch) return { commitSha };
  const since = Date.now() - 5000;
  const d = gh("POST", `/repos/${REPO}/actions/workflows/browser-merge.yml/dispatches`, { ref: "main" });
  if (d.status !== 204) throw new Error(`dispatch: HTTP ${d.status} ${JSON.stringify(d.body).slice(0, 200)}`);
  log("merge workflow started");
  if (!wait) return { commitSha };
  let run = null;
  for (let i = 0; i < 90; i++) { // up to ~30 min (it may queue behind the 4-hourly robot run)
    await sleep(20000);
    const j = await pub(`/repos/${REPO}/actions/workflows/browser-merge.yml/runs?per_page=3&event=workflow_dispatch`).catch(() => null);
    run = j && (j.workflow_runs || []).find((r) => Date.parse(r.created_at) >= since);
    if (run && run.status === "completed") break;
    if (i % 3 === 0) log("merge workflow:", run ? run.status : "not listed yet");
  }
  if (!run || run.status !== "completed") throw new Error("merge workflow did not finish in 30 min" + (run ? ` (${run.html_url})` : ""));
  log("merge workflow", run.conclusion, run.html_url);
  if (run.conclusion !== "success") throw new Error(`merge workflow ${run.conclusion}: ${run.html_url}`);
  return { commitSha, run: run.html_url };
}

export async function checkLive(storeIds) {
  for (let i = 0; i < 12; i++) {
    const g = await (await fetch(`https://david7578433-bit.github.io/reallow/data/groceries.json?t=${Date.now()}`, { cache: "no-store" })).json().catch(() => null);
    if (g) {
      const st = g.stores.filter((s) => storeIds.includes(s.id));
      const fresh = st.filter((s) => s.status === "ok" && s.via === "browser");
      if (fresh.length) {
        const idx = Object.fromEntries(g.stores.map((s, i) => [i, s]));
        const mkj = g.items.filter((it) => it[2].some((o) => idx[o[0]].city === "Monroe / Kiryas Joel")).length;
        const mkjBrowser = g.items.filter((it) => it[2].some((o) => idx[o[0]].city === "Monroe / Kiryas Joel" && idx[o[0]].via === "browser")).length;
        const multiMkj = g.items.filter((it) => it[2].filter((o) => idx[o[0]].city === "Monroe / Kiryas Joel").length > 1).length;
        return { updated: g.updated, stats: g.stats, stores: st.map((s) => ({ id: s.id, status: s.status, count: s.count, checked: s.checked, stale: !!s.stale })), monroe_kj_items: mkj, monroe_kj_items_from_browser_stores: mkjBrowser, monroe_kj_items_two_plus_stores: multiMkj };
      }
    }
    await sleep(20000);
  }
  return null;
}
