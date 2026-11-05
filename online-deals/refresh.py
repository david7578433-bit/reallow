#!/usr/bin/env python3
"""RealLow online deals: daily refresh helper. Run from a Tab turn (needs TAB_TASK_ID for the GitHub push and the browser).
  python3 refresh.py recheck   # re-open every current deal on the store's own page, update prices, drop dead/expired ones
  python3 refresh.py add <candidates.json>   # verify new candidates [{store,id,url,title,cats}] on the product page and add the good ones
  python3 refresh.py post      # write /home/user/tab/files/reallow-daily-post.txt from the current deals
  python3 refresh.py push      # push data/online-deals.json to david7578433-bit/reallow main (Git Data API), then republish reallow.sites.tab.bot
Working copy of the data: /home/user/tab/files/reallow-online-deals/online-deals.json (the push copies it to data/online-deals.json).
"""
import json, os, re, sys, subprocess, base64, hashlib, uuid, time, datetime, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "online-deals.json")
REPO = "david7578433-bit/reallow"
MIN_OFF = 15          # drop a deal under this % off
MAX_DEALS = 25
TID = os.environ.get("TAB_TASK_ID", "")
WALMART_KNOBS = json.dumps({"browserSettings": {"os": "mobile"}})   # NY geo proxy + us-east-1 are check.mjs defaults; Walmart needs os mobile

def num(s):
    m = re.search(r"\$\s*([\d,]+\.\d{2})", s or "")
    return float(m.group(1).replace(",", "")) if m else None

def run_check(items, tag):
    out = f"/home/user/tab/tasks/{TID}/check-{tag}.jsonl"; shots = f"/home/user/tab/tasks/{TID}/shots"; os.makedirs(shots, exist_ok=True)
    if os.path.exists(out): os.remove(out)
    for store in ("Amazon", "Walmart", "Target"):
        part = [i for i in items if i["store"] == store]
        if not part: continue
        inp = f"/home/user/tab/tasks/{TID}/urls-{tag}-{store}.json"; json.dump(part, open(inp, "w"))
        if store == "Amazon": part.insert(0, {"store": "Amazon", "id": "warm", "url": "https://www.amazon.com/"}); json.dump(part, open(inp, "w"))
        args = ["timeout", "-k", "5", "1500", "/usr/bin/node", os.path.join(HERE, "check.mjs"), inp, out, shots] + ([WALMART_KNOBS] if store == "Walmart" else [])
        subprocess.run(args, cwd=HERE, stdout=open(out + ".log", "a"), stderr=subprocess.STDOUT)
    return {r["id"]: r for r in (json.loads(l) for l in open(out)) if r.get("id") != "warm"} if os.path.exists(out) else {}

def read_rec(r):
    """price/was from a check.mjs record; None when the page shows no buyable price."""
    if r.get("store") == "Walmart":
        p = num(r.get("price")); w = num(r.get("basis")); return p, (w if w and p and w > p else None), "Was"
    p = num(r.get("price")); w = num(r.get("basis"))
    if not p or "unavailable" in (r.get("avail") or "").lower(): return None, None, None
    lab = "Typical price" if (r.get("basis_label") or "").lower().startswith("typical") else "List Price"
    return p, (w if w and w > p else None), lab

def recheck():
    j = json.load(open(DATA)); deals = j["deals"]
    items = [{"store": d["store"], "id": d["id"].split("-", 1)[1].upper() if d["store"] == "Amazon" else d["id"].split("-", 1)[1], "url": d["url"].split("?")[0], "_id": d["id"]} for d in deals]
    recs = run_check(items, "recheck")
    keep, dropped = [], []
    for d, it in zip(deals, items):
        r = recs.get(it["id"]); p, w, lab = read_rec(r) if r else (None, None, None)
        if not p: dropped.append((d["title"], "no price on the page")); continue
        pct = round((1 - p / w) * 100) if w else 0
        if pct < MIN_OFF: dropped.append((d["title"], f"deal over ({pct}% off now)")); continue
        d.update(price=p, was=w, was_label=lab, pct_off=pct, checked_at=r["checked_at"][:19] + "Z"); keep.append(d)
    j["deals"] = sorted(keep, key=lambda d: -d["pct_off"]); j["updated"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(j, open(DATA, "w"), indent=1, ensure_ascii=False)
    print(f"kept {len(keep)}, dropped {len(dropped)}"); [print("  dropped:", *x) for x in dropped]

def add(cands_path):
    j = json.load(open(DATA)); have = {d["id"] for d in j["deals"]}
    cands = json.load(open(cands_path)); recs = run_check(cands, "add"); added = 0
    for c in cands:
        did = ("amz-" if c["store"] == "Amazon" else c["store"][:3].lower() + "-") + c["id"].lower()
        r = recs.get(c["id"]); p, w, lab = read_rec(r) if r else (None, None, None)
        if did in have or not p or not w or round((1 - p / w) * 100) < MIN_OFF: print("skip", c.get("title") or c["id"], p, w); continue
        url = f"https://www.amazon.com/dp/{c['id']}?tag=reallow-20" if c["store"] == "Amazon" else c["url"].split("?")[0]
        img = c.get("image") or r.get("image") or ""
        img = re.sub(r"\._[^/]*_\.(jpg|png)$", r"._AC_SL300_.\1", img) if "media-amazon" in img else img
        j["deals"].append(dict(id=did, title=c.get("title") or r.get("title", "")[:90], store=c["store"], price=p, was=w, was_label=lab, pct_off=round((1 - p / w) * 100),
                               image=img if c.get("image_ok") else "", url=url, checked_at=r["checked_at"][:19] + "Z", cats=c.get("cats", []), sold_by=(r.get("seller") or "").replace("Shipper / Seller", "").strip()[:60], product_title=(r.get("title") or "")[:200]))
        added += 1
    j["deals"] = sorted(j["deals"], key=lambda d: -d["pct_off"])[:MAX_DEALS]
    json.dump(j, open(DATA, "w"), indent=1, ensure_ascii=False); print("added", added, "total", len(j["deals"]))

EMO = [("diaper", "👶"), ("pacifier", "🍼"), ("bottle", "🍼"), ("trash", "🗑️"), ("paper towel", "🧻"), ("toilet", "🧻"), ("napkin", "🧻"), ("bowl", "🥣"), ("plate", "🍽️"),
       ("laundry", "🧺"), ("detergent", "🧺"), ("pods", "🧺"), ("dish", "🧽"), ("cleaner", "🧽"), ("wrap", "🍱"), ("bag", "🍱"), ("container", "🍱"), ("baby", "🛁"), ("cereal", "🥣"), ("tylenol", "💊")]
def post():
    j = json.load(open(DATA)); deals = sorted(j["deals"], key=lambda d: -d["pct_off"])
    pick, stores = [], {}
    for d in deals:                      # best % off first, max 2 of the same kind of item, at least one per store when possible
        kind = next((k for k, _ in EMO if k in d["title"].lower()), d["title"][:8])
        if sum(1 for x in pick if next((k for k, _ in EMO if k in x["title"].lower()), x["title"][:8]) == kind) >= 2: continue
        pick.append(d)
        if len(pick) == 10: break
    day = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-5))).strftime("%a %b %-d")
    lines = [f"*RealLow Top Deals — {day}* 🔥", ""]
    for d in pick:
        e = next((v for k, v in EMO if k in d["title"].lower()), "🔥")
        url = re.sub(r"(https://www\.walmart\.com/ip/)[^ ]*/(\d+)$", r"\1\2", d["url"])
        lines.append(f"{e} {d['title']}: *${d['price']:.2f}*" + (f" ~${d['was']:.2f}~" if d.get("was") else "") + f" ({d['pct_off']}% off, {d['store']}) {url}")
    lines += ["", "Prices checked on the store's own page; they can change fast.", "All of today's deals + local store prices: https://reallow.sites.tab.bot/#online", "(Amazon links are RealLow affiliate links.)"]
    open("/home/user/tab/files/reallow-daily-post.txt", "w").write("\n".join(lines) + "\n"); print("\n".join(lines))

def gh(method, url, body=None):
    f = f"/home/user/tab/tasks/{TID}/gh-{uuid.uuid4().hex[:8]}.json"
    req = {"toolkit": "github", "method": method, "url": url, "headers": {"Accept": "application/vnd.github+json", "X-RealLow-Nonce": uuid.uuid4().hex}}
    if body is not None: req["body"] = body
    json.dump(req, open(f, "w"))
    try:
        o = subprocess.run(["/usr/bin/node", "/home/user/tab/connected-apps-cli.mjs", "connected_apps.request", f], capture_output=True, text=True, timeout=180, env=dict(os.environ, NO_COLOR="1", FORCE_COLOR="")).stdout
        r = json.loads(o[o.index("{"):]); r = r.get("result", r); b = r.get("body")
        if b is None and isinstance(r.get("body_head"), str):
            try: b = json.loads(r["body_head"])
            except Exception: b = r["body_head"]
        return r.get("status"), b
    finally: os.remove(f)

def push():
    c = open(DATA, "rb").read()
    st, b = gh("POST", f"/repos/{REPO}/git/blobs", {"content": base64.b64encode(c).decode(), "encoding": "base64"})
    assert st == 201 and b["sha"] == hashlib.sha1(b"blob %d\0" % len(c) + c).hexdigest(), (st, b)
    for _ in range(4):
        st, ref = gh("GET", f"/repos/{REPO}/git/ref/heads/main"); head = ref["object"]["sha"]          # re-read main right before the push
        st, hc = gh("GET", f"/repos/{REPO}/git/commits/{head}")
        st, tr = gh("POST", f"/repos/{REPO}/git/trees", {"base_tree": hc["tree"]["sha"], "tree": [{"path": "data/online-deals.json", "mode": "100644", "type": "blob", "sha": b["sha"]}]})
        if st != 201: time.sleep(5); continue
        st, cm = gh("POST", f"/repos/{REPO}/git/commits", {"message": "Online deals refreshed " + datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"), "tree": tr["sha"], "parents": [head]})
        st, u = gh("PATCH", f"/repos/{REPO}/git/refs/heads/main", {"sha": cm["sha"], "force": False})
        if st == 200: print("pushed", cm["sha"][:7]); break
        time.sleep(5)
    else: raise SystemExit("push failed")
    # the push deploys GitHub Pages by itself (robots.yml runs on push). The tab.bot copy reads data from Pages first,
    # so a republish is only needed when site files change; refresh its fallback copy anyway:
    pub = os.path.join(HERE, "publish-copy")
    if os.path.isdir(pub):
        os.makedirs(os.path.join(pub, "data"), exist_ok=True); open(os.path.join(pub, "data", "online-deals.json"), "wb").write(c)
        p = subprocess.run(["timeout", "-k", "5", "400", "/usr/bin/node", "/home/user/tab/publish-cli.mjs", "site.publish", json.dumps({"slug": "reallow", "source_dir": pub, "title": "RealLow"})], capture_output=True, text=True)
        print("publish:", p.stdout[-300:])
    print("verify: https://david7578433-bit.github.io/reallow/data/online-deals.json and https://reallow.sites.tab.bot/#online")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"recheck": recheck, "post": post, "push": push}.get(cmd, lambda: add(sys.argv[2]) if cmd == "add" else print(__doc__))()
