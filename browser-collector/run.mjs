// ONE command: collect the bot-checked kosher stores in a real browser, push to the RealLow repo, merge, publish, verify.
//   node /home/user/tab/files/reallow-browser-collector/run.mjs            (all stores)
//   node /home/user/tab/files/reallow-browser-collector/run.mjs refresh    (just some stores)
// Log: logs/run-<UTC time>.log (+ logs/latest.log). Summary: logs/last-run.json. Exit code 0 = live on the site.
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process";
const DIR = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(path.join(DIR, "logs"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const LOG = path.join(DIR, "logs", `run-${stamp}.log`);
const out = fs.createWriteStream(LOG, { flags: "a" });
const log = (...a) => { const l = new Date().toISOString().slice(11, 19) + " " + a.join(" "); console.log(l); out.write(l + "\n"); };
const LOCK = path.join(DIR, "run.lock");
if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 3 * 3600e3) { log("another run is in progress (run.lock); exiting"); process.exit(2); }
fs.writeFileSync(LOCK, String(process.pid));
const t0 = Date.now(); const summary = { started: new Date().toISOString(), log: LOG };
try {
  const ids = process.argv.slice(2);
  for (const f of fs.readdirSync(path.join(DIR, "out")).filter((f) => f.endsWith(".json"))) fs.rmSync(path.join(DIR, "out", f));
  log("1/4 collecting in a real browser:", ids.length ? ids.join(", ") : "all stores");
  const code = await new Promise((res) => {
    const c = spawn("/usr/bin/node", [path.join(DIR, "collect.mjs"), ...ids], { cwd: DIR, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const pipe = (s) => s.on("data", (d) => { process.stdout.write(d); out.write(d); });
    pipe(c.stdout); pipe(c.stderr);
    const kill = setTimeout(() => { log("collector over 100 min, stopping it"); c.kill("SIGKILL"); }, 100 * 60e3);
    c.on("exit", (code) => { clearTimeout(kill); res(code); });
  });
  const coll = JSON.parse(fs.readFileSync(path.join(DIR, "out", "_summary.json"), "utf8")).summary;
  summary.collect = coll; summary.collector_exit = code;
  const okIds = Object.entries(coll).filter(([, v]) => v.status === "ok").map(([k]) => k);
  log("collected:", JSON.stringify(coll));
  if (!okIds.length) throw new Error("no store came through this run; nothing pushed (the site keeps the last good prices)");
  log("2/4 exporting");
  await new Promise((res, rej) => { const c = spawn("/usr/bin/node", [path.join(DIR, "export.mjs")], { cwd: DIR }); c.stdout.on("data", (d) => log(String(d).trim())); c.stderr.on("data", (d) => out.write(d)); c.on("exit", (x) => x ? rej(new Error("export failed")) : res()); });
  log("3/4 pushing to GitHub + merge workflow");
  const { pushExport, checkLive } = await import(path.join(DIR, "push.mjs"));
  const p = await pushExport({ message: `Browser prices: ${okIds.join(", ")} (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)` });
  fs.copyFileSync(path.join(DIR, "export", "index.json"), path.join(DIR, "last-index.json"));
  summary.commit = p.commitSha; summary.merge_run = p.run;
  log("4/4 checking the live site");
  const live = await checkLive(okIds);
  summary.live = live; log("live:", JSON.stringify(live));
  if (!live) throw new Error("the live data file did not show the browser stores yet");
  summary.ok = true;
} catch (e) { summary.ok = false; summary.error = e.message; log("FAILED:", e.message); }
finally {
  summary.minutes = Math.round((Date.now() - t0) / 6000) / 10; log(`done in ${summary.minutes} min, ok=${summary.ok}`);
  fs.writeFileSync(path.join(DIR, "logs", "last-run.json"), JSON.stringify(summary, null, 1));
  fs.copyFileSync(LOG, path.join(DIR, "logs", "latest.log"));
  fs.rmSync(LOCK, { force: true }); out.end();
  // keep the last 30 run logs
  const logs = fs.readdirSync(path.join(DIR, "logs")).filter((f) => /^run-/.test(f)).sort(); for (const f of logs.slice(0, -30)) fs.rmSync(path.join(DIR, "logs", f));
  process.exitCode = summary.ok ? 0 : 1;
}
