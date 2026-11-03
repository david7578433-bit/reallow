// Polite fetch: honest User-Agent, robots.txt check, per-host delay, stop on blocks.
export const UA = 'RealLowBot/1.0 (+https://reallow.sites.tab.bot/about-robots; price comparison for shoppers)';
const robotsCache = new Map();
const lastHit = new Map();
export class Blocked extends Error { constructor(msg, status) { super(msg); this.blocked = true; this.status = status; } }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRobots(txt) {
  // Returns groups: [{agents:[...], rules:[{allow:bool, path}]}]
  const groups = []; let cur = null; let lastWasAgent = false;
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; }
    else if (k === 'allow' || k === 'disallow') { lastWasAgent = false; if (cur) cur.rules.push({ allow: k === 'allow', path: v }); }
    else lastWasAgent = false;
  }
  return groups;
}
function matchRule(path, rulePath) {
  if (!rulePath) return -1;
  const esc = rulePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp('^' + (esc.endsWith('\\$') ? esc.slice(0, -2) + '$' : esc));
  return re.test(path) ? rulePath.length : -1;
}
export async function robotsAllowed(url) {
  const u = new URL(url); const key = u.origin;
  if (!robotsCache.has(key)) {
    let groups = [];
    try {
      const r = await fetch(key + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (r.ok) groups = parseRobots(await r.text());
      else if (r.status >= 500) groups = [{ agents: ['*'], rules: [{ allow: false, path: '/' }] }]; // RFC 9309: 4xx = no rules, 5xx = assume disallow
    } catch { groups = []; }
    robotsCache.set(key, groups);
  }
  const groups = robotsCache.get(key);
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && 'realLowBot'.toLowerCase().includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  const path = u.pathname + u.search;
  let best = { len: -1, allow: true };
  for (const g of use) for (const r of g.rules) {
    const len = matchRule(path, r.path);
    if (len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best.allow;
}

// politeFetch: waits `delayMs` between hits to the same host, checks robots.txt, throws Blocked on 401/403/429/503 or a bot-check page.
export async function politeFetch(url, opts = {}, delayMs = 1500) {
  if (!(await robotsAllowed(url))) throw new Blocked('robots.txt disallows ' + new URL(url).pathname, 0);
  const host = new URL(url).host;
  const wait = (lastHit.get(host) || 0) + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  let r;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, 'Accept': 'application/json, text/html;q=0.8, */*;q=0.5', ...(opts.headers || {}) }, signal: AbortSignal.timeout(45000) });
      break;
    } catch (e) { if (attempt === 1) throw e; await sleep(5000); }
  }
  if ([401, 403, 429, 503].includes(r.status)) throw new Blocked(`HTTP ${r.status} from ${host}`, r.status);
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('text/html') && opts.expectJson) {
    const t = await r.text();
    if (/Just a moment|cf-challenge|captcha|Access denied/i.test(t)) throw new Blocked('bot check page from ' + host, r.status);
    throw new Error('expected JSON, got HTML from ' + host);
  }
  return r;
}
export { sleep };
