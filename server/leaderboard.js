// 地铁冲冲冲！—— 每日挑战全网排行榜（零依赖，Node.js 18+）
//
// 运行：PORT=3210 DATA_DIR=/var/lib/ditie node server/leaderboard.js
// Nginx 把 /api/ 转发到这里（见 deploy/nginx-ditie.conf）。
//
// 接口：
//   GET  /api/daily/2026-11-22?limit=20   → { date, total, top: [{ rank, name, passengers, score }] }
//   POST /api/daily/2026-11-22            → { rank, total, best }
//        body: { device, name, stops: [{ kind, wrongDoor, lateBonus }, ...], score }
//
// 防作弊：乘客人数由服务器按每站结果重新计算（规则见 lib/rules.js，与游戏共用），分数有上限；
// 只接受北京时间“今天”（容许前后 1 天，照顾跨零点）的成绩；同一设备每天只保留最好一次。

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const KEEP_DAYS = 30;

// 接乘客规则与游戏共用：部署时 rules.js 和本文件放在同一目录；在项目里运行时用 ../lib/rules.js
const RULES_PATH = fs.existsSync(path.join(__dirname, "rules.js")) ? path.join(__dirname, "rules.js") : path.join(__dirname, "..", "lib", "rules.js");
const { RULES, simulate } = require(RULES_PATH);
const MAX_SCORE_PER_STOP = 120;
const DAILY_STOPS = 5;

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- 工具 ----------
function bjDate(offsetDays = 0) {
  const d = new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3);
  return d.toISOString().slice(0, 10);
}
function validDay(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && [bjDate(-1), bjDate(0), bjDate(1)].includes(date);
}
const BAD = ["傻", "笨蛋", "死", "滚", "操", "妈的", "sb", "fuck", "shit"];
function cleanName(raw) {
  let s = String(raw || "").replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, "").trim();
  s = Array.from(s).slice(0, 8).join("");
  if (!s || BAD.some((w) => s.toLowerCase().includes(w))) s = "小司机";
  return s;
}

// ---------- 存储：每天一个 JSON 文件，内存里一份 ----------
const days = new Map(); // date -> Map(device -> entry)
function file(date) { return path.join(DATA_DIR, `daily-${date}.json`); }
function load(date) {
  if (!days.has(date)) {
    let m = new Map();
    try { m = new Map(Object.entries(JSON.parse(fs.readFileSync(file(date), "utf8")))); } catch (e) {}
    days.set(date, m);
  }
  return days.get(date);
}
const dirty = new Set();
function persist(date) {
  dirty.add(date);
  setTimeout(flush, 500).unref();
}
function flush() {
  for (const date of dirty) {
    const tmp = file(date) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(load(date))));
    fs.renameSync(tmp, file(date));
  }
  dirty.clear();
}
function cleanup() {
  const cutoff = bjDate(-KEEP_DAYS);
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = /^daily-(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
    if (m && m[1] < cutoff) fs.unlinkSync(path.join(DATA_DIR, f));
  }
  for (const d of days.keys()) if (d < cutoff) days.delete(d);
}
setInterval(cleanup, 6 * 3600e3).unref();
cleanup();

function ranked(date) {
  return [...load(date).values()].sort((a, b) => b.passengers - a.passengers || b.score - a.score || a.at - b.at);
}

// ---------- 频率限制：每个 IP 每小时最多 60 次提交 ----------
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  list.push(now);
  hits.set(ip, list);
  return list.length > 60;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (!l.some((t) => now - t < 3600e3)) hits.delete(ip); }, 600e3).unref();

// ---------- HTTP ----------
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 4096) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const m = /^\/api\/daily\/([\d-]+)$/.exec(url.pathname);
  if (url.pathname === "/api/health") return send(res, 200, { ok: true, today: bjDate() });
  if (!m) return send(res, 404, { error: "not found" });
  const date = m[1];
  if (!validDay(date)) return send(res, 400, { error: "只能查看或提交今天的每日挑战" });

  if (req.method === "GET") {
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 20));
    const list = ranked(date);
    return send(res, 200, {
      date, total: list.length,
      top: list.slice(0, limit).map((e, i) => ({ rank: i + 1, name: e.name, passengers: e.passengers, score: e.score })),
    });
  }

  if (req.method === "POST") {
    const ip = (req.headers["x-real-ip"] || req.socket.remoteAddress || "").toString();
    if (limited(ip)) return send(res, 429, { error: "提交太频繁了，休息一下再来" });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: "格式不对" }); }
    const device = String(body.device || "");
    // 兼容旧版前端只传 kinds 的情况
    const stops = (Array.isArray(body.stops) ? body.stops : Array.isArray(body.kinds) ? body.kinds.map((k) => ({ kind: k })) : [])
      .map((st) => ({ kind: st && st.kind, wrongDoor: !!(st && st.wrongDoor), lateBonus: !!(st && st.lateBonus) }));
    const kinds = stops.map((st) => st.kind);
    const score = Number(body.score);
    if (!/^[a-z0-9-]{8,40}$/i.test(device)) return send(res, 400, { error: "设备标识不对" });
    if (kinds.length !== DAILY_STOPS || !kinds.every((k) => k in RULES)) return send(res, 400, { error: "停车记录不对" });
    if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE_PER_STOP * DAILY_STOPS) return send(res, 400, { error: "分数不对" });
    if (kinds.includes("missed") && score > MAX_SCORE_PER_STOP * (DAILY_STOPS - kinds.filter((k) => k === "missed").length)) {
      return send(res, 400, { error: "分数不对" });
    }

    const entry = { name: cleanName(body.name), passengers: simulate(stops), score, at: Date.now() };
    const day = load(date);
    const old = day.get(device);
    if (!old || entry.passengers > old.passengers || (entry.passengers === old.passengers && entry.score > old.score)) {
      day.set(device, entry);
      persist(date);
    } else if (old.name !== entry.name) {
      old.name = entry.name;
      persist(date);
    }
    const list = ranked(date);
    const mine = day.get(device);
    return send(res, 200, { rank: list.indexOf(mine) + 1, total: list.length, best: { passengers: mine.passengers, score: mine.score } });
  }

  send(res, 405, { error: "method not allowed" });
});

server.listen(PORT, HOST, () => console.log(`排行榜服务已启动：http://${HOST}:${PORT}  数据目录：${DATA_DIR}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { flush(); process.exit(0); });
