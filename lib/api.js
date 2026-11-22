// 全网排行榜接口：只在正式网站（同域名下有 /api/）上启用，其他地方自动隐藏
const DEVICE_KEY = "metro-rush-device";

export function apiEnabled() {
  return typeof location !== "undefined" && /gmgnclaw\.com$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) {
    return "anon-" + Math.random().toString(36).slice(2, 12);
  }
}

async function call(url, opts) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "网络错误");
    return data;
  } finally {
    clearTimeout(t);
  }
}

export function fetchDaily(date, limit = 20) {
  if (!apiEnabled()) return Promise.resolve(null);
  return call(`/api/daily/${date}?limit=${limit}`).catch(() => null);
}

// 设备 id 加上玩家序号，双人对战时两位司机各自上榜
export function submitDaily(date, { name, results, player = 0 }) {
  if (!apiEnabled()) return Promise.resolve(null);
  const body = {
    device: `${deviceId()}-${player}`.slice(0, 40),
    name,
    stops: results.map((r) => ({ kind: r.kind, wrongDoor: !!r.wrongDoor, lateBonus: !!r.lateBonus, event: r.event || null })),
    score: results.reduce((s, r) => s + r.total, 0),
  };
  return call(`/api/daily/${date}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
}
