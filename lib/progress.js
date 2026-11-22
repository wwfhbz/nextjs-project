// 本机进度：集站手册、成就、每日挑战成绩（只存在这台设备的浏览器里）
import { LINES, transfersAt } from "./lines";
import { SKINS } from "./skins";

const KEY = "metro-rush-progress-v1";

const empty = () => ({
  visited: {}, // { 线路id: [站名...] }
  trips: 0,
  precise: 0,
  perfect: 0,
  transfers: 0,
  bestPax: 0,
  daily: {}, // { "2026-11-22": { name, passengers, score } }
  unlocked: [], // 成就 id
  coins: 0, // 金币：每上来一位乘客 1 枚
  skins: ["standard"], // 已拥有的涂装
  skin: "standard", // 正在使用的涂装
  maxCombo: 0,
  lateWaits: 0, // 等到迟到乘客的次数
  goodDoors: 0, // 一次就开对车门的次数
});

export function loadProgress() {
  try {
    return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch (e) {
    return empty();
  }
}
function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
}

// 成就：check(p) 为真即解锁
export const ACHIEVEMENTS = [
  { id: "first", icon: "🚇", name: "第一次发车", desc: "完成第一趟行程", check: (p) => p.trips >= 1 },
  { id: "perfect", icon: "🎯", name: "分毫不差", desc: "误差 0.5 米以内停车", check: (p) => p.perfect >= 1 },
  { id: "precise10", icon: "🏅", name: "精准小能手", desc: "累计精准停车 10 次", check: (p) => p.precise >= 10 },
  { id: "precise50", icon: "🏆", name: "精准大师", desc: "累计精准停车 50 次", check: (p) => p.precise >= 50 },
  { id: "pax500", icon: "👨‍👩‍👧", name: "满载而归", desc: "一趟结束时车上有 500 人以上", check: (p) => p.bestPax >= 500 },
  { id: "transfer10", icon: "🔀", name: "换乘达人", desc: "在换乘站停车 10 次", check: (p) => p.transfers >= 10 },
  { id: "allLines", icon: "🗺️", name: "线路探险家", desc: "1–7 号线都开过", check: (p) => LINES.every((l) => (p.visited[l.id] || []).length > 0) },
  { id: "daily3", icon: "📅", name: "天天来开车", desc: "完成 3 次每日挑战", check: (p) => Object.keys(p.daily).length >= 3 },
  { id: "combo4", icon: "🔥", name: "连击王", desc: "连续 4 次精准停车", check: (p) => p.maxCombo >= 4 },
  { id: "doors20", icon: "🚪", name: "车门小专家", desc: "一次就开对车门 20 次", check: (p) => p.goodDoors >= 20 },
  { id: "late5", icon: "🏃", name: "暖心司机", desc: "等到 5 位最后跑来的乘客", check: (p) => p.lateWaits >= 5 },
  { id: "skin1", icon: "🎨", name: "换新装", desc: "用金币换一套车身涂装", check: (p) => p.skins.length >= 2 },
  ...LINES.map((l) => ({
    id: "line" + l.id, icon: String(l.id), color: l.color, name: `${l.name}全收集`,
    desc: `集齐${l.name}全部 ${l.stations.length} 个车站`,
    check: (p) => (p.visited[l.id] || []).length >= l.stations.length,
  })),
];

// 跑完一趟后记录，返回本次新解锁的成就
export function recordTrip(line, trip, results, dailyKey, name) {
  const p = loadProgress();
  const seen = new Set(p.visited[line.id] || []);
  seen.add(trip.names[0]);
  results.forEach((r) => {
    if (!r.missed) seen.add(r.station);
    if (r.kind === "precise") p.precise += 1;
    if (!r.missed && Math.abs(r.err) <= 0.5) p.perfect += 1;
    if (!r.missed && transfersAt(r.station, line.id).length) p.transfers += 1;
    if (!r.missed && !r.wrongDoor) p.goodDoors += 1;
    if (r.lateBonus) p.lateWaits += 1;
    p.maxCombo = Math.max(p.maxCombo, r.combo || 0);
    p.coins += r.coins || 0;
  });
  p.visited[line.id] = [...seen];
  p.trips += 1;
  const passengers = results[results.length - 1].onboard;
  p.bestPax = Math.max(p.bestPax, passengers);
  if (dailyKey) {
    const score = results.reduce((s, r) => s + r.total, 0);
    const old = p.daily[dailyKey];
    if (!old || passengers > old.passengers || (passengers === old.passengers && score > old.score)) {
      p.daily[dailyKey] = { name, passengers, score };
    }
  }
  const fresh = ACHIEVEMENTS.filter((a) => !p.unlocked.includes(a.id) && a.check(p));
  p.unlocked = [...p.unlocked, ...fresh.map((a) => a.id)];
  save(p);
  return fresh;
}

// ---------- 每日挑战：同一天所有人开同一条线、同一段路 ----------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function todayKey(d = new Date()) {
  // 按北京时间算日期，全国同一天同一题
  const bj = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
  const m = String(bj.getMonth() + 1).padStart(2, "0");
  const day = String(bj.getDate()).padStart(2, "0");
  return `${bj.getFullYear()}-${m}-${day}`;
}
export function dailyPlan(key = todayKey()) {
  const h = hash("ditie-" + key);
  const line = LINES[h % LINES.length];
  const stops = 5;
  const n = line.stations.length;
  const dir = (h >> 4) & 1 ? 1 : -1;
  const first = (h >> 8) % (n - stops);
  const startIndex = dir > 0 ? first : first + stops;
  return { key, line, stops, dir, startIndex };
}

// ---------- 车库：用金币买涂装、换涂装 ----------
export function buySkin(id) {
  const p = loadProgress();
  const skin = SKINS.find((x) => x.id === id);
  if (!skin || p.skins.includes(id) || p.coins < skin.price) return { ok: false, p, fresh: [] };
  p.coins -= skin.price;
  p.skins = [...p.skins, id];
  p.skin = id;
  const fresh = ACHIEVEMENTS.filter((a) => !p.unlocked.includes(a.id) && a.check(p));
  p.unlocked = [...p.unlocked, ...fresh.map((a) => a.id)];
  save(p);
  return { ok: true, p, fresh };
}
export function equipSkin(id) {
  const p = loadProgress();
  if (p.skins.includes(id)) { p.skin = id; save(p); }
  return p;
}
