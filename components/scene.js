// 驾驶画面绘制：6 节编组 B 型地铁列车、隧道、车站、站台门
// 坐标：水平方向以“米”为单位沿轨道，车头位置 = s.x；垂直方向按车高 3.8 米缩放

export const CAR_LEN = 19.6; // 每节车长（米）
export const CARS = 6; // 合肥地铁 6 节编组
export const TRAIN_LEN = CAR_LEN * CARS;
export const PLATFORM_LEN = 124; // 站台长度（米）
const DOOR_POS = [0.14, 0.38, 0.62, 0.86]; // 每节车 4 对车门（中心位置占车长比例）
const DOOR_W = 1.4; // 车门宽（米）

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// 车门中心位置（米）：车头在 head 时，第 i 节车（0 = 车头那节）的第 k 个门
export function doorCenters(head) {
  const out = [];
  for (let i = 0; i < CARS; i++) {
    const rear = head - (i + 1) * CAR_LEN;
    DOOR_POS.forEach((f) => out.push(rear + CAR_LEN * f));
  }
  return out;
}

// 小人：站台上等车的乘客
function person(c, x, foot, h, look) {
  const head = h * 0.17;
  c.fillStyle = look.body;
  roundRect(c, x - h * 0.13, foot - h * 0.66, h * 0.26, h * 0.42, h * 0.08);
  c.fill();
  c.fillStyle = look.legs;
  c.fillRect(x - h * 0.1, foot - h * 0.26, h * 0.08, h * 0.26);
  c.fillRect(x + h * 0.02, foot - h * 0.26, h * 0.08, h * 0.26);
  c.fillStyle = "#f6cfa8";
  c.beginPath();
  c.arc(x, foot - h * 0.8, head, 0, 7);
  c.fill();
  c.fillStyle = look.hair;
  c.beginPath();
  c.arc(x, foot - h * 0.84, head * 0.95, Math.PI, 0);
  c.fill();
  if (look.bag) {
    c.fillStyle = look.bag;
    roundRect(c, x + h * 0.1, foot - h * 0.6, h * 0.12, h * 0.22, 3);
    c.fill();
  }
}
const LOOKS = [
  { body: "#ff7043", legs: "#37474f", hair: "#3e2723", bag: "#ffd54f" },
  { body: "#42a5f5", legs: "#263238", hair: "#212121" },
  { body: "#ab47bc", legs: "#455a64", hair: "#5d4037", bag: "#80cbc4" },
  { body: "#66bb6a", legs: "#37474f", hair: "#212121" },
  { body: "#ffca28", legs: "#3949ab", hair: "#6d4c41", bag: "#ef5350" },
  { body: "#26c6da", legs: "#424242", hair: "#9e9e9e" },
];

export function drawScene(c, W, H, s, o) {
  const { seg, line, terminal, doorsOpen } = o;
  // 每米像素：横向尽量拉长车厢，接近真实比例
  // 竖屏（手机）时画面更高，放大一些，列车不至于太小
  const portrait = H > W * 0.9;
  const sc = clamp(Math.max(W / 90, portrait ? H / 62 : 0), 4, 13);
  const headX = W * 0.56;
  const X = (m) => headX + (m - s.x) * sc;
  const ty = H * 0.82; // 轨面
  // 车高（含车顶设备）像素；限制高度让车厢保持修长
  const th = clamp(Math.min(H * 0.4, CAR_LEN * sc * (portrait ? 0.75 : 0.5)), 56, 180);
  const vs = th / 3.8; // 每米像素（竖直）
  const bodyBot = ty - 0.95 * vs; // 车体底部（地板）
  const bodyTop = bodyBot - 2.95 * vs; // 车顶
  const wireY = bodyTop - 0.85 * vs; // 接触网
  const atStation = [0, seg.len].map((mark) => {
    const a = X(mark - PLATFORM_LEN), b = X(mark + 4);
    return { mark, a, b, on: b > 0 && a < W, name: mark === 0 ? seg.from : seg.to };
  });

  // ---------- 隧道背景 ----------
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1c2130");
  bg.addColorStop(0.55, "#2a3142");
  bg.addColorStop(1, "#151924");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  // 管片接缝
  c.strokeStyle = "rgba(255,255,255,.05)";
  c.lineWidth = 2;
  const ring = 1.5 * sc * 4;
  for (let px = -((s.x * sc) % ring); px < W; px += ring) {
    c.beginPath(); c.moveTo(px, 0); c.lineTo(px, ty); c.stroke();
  }
  // 电缆支架
  for (let k = 0; k < 3; k++) {
    const y = bodyTop + (0.6 + k * 0.45) * vs;
    c.fillStyle = k === 1 ? "#4a5163" : "#3b4152";
    c.fillRect(0, y, W, Math.max(2, vs * 0.07));
  }
  // 隧道灯
  const lampGap = 12 * sc;
  for (let px = -((s.x * sc) % lampGap); px < W + lampGap; px += lampGap) {
    const g = c.createRadialGradient(px, wireY - 0.5 * vs, 0, px, wireY - 0.5 * vs, vs * 1.6);
    g.addColorStop(0, "rgba(255,236,170,.45)");
    g.addColorStop(1, "rgba(255,236,170,0)");
    c.fillStyle = g;
    c.fillRect(px - vs * 1.6, wireY - 2.1 * vs, vs * 3.2, vs * 3.2);
    c.fillStyle = "#fff3c4";
    c.fillRect(px - vs * 0.35, wireY - 0.6 * vs, vs * 0.7, Math.max(2, vs * 0.12));
  }

  // ---------- 车站（轨行区对面的墙：站名牌、广告灯箱） ----------
  atStation.forEach(({ mark, a, b, on, name }) => {
    if (!on) return;
    const top = 0;
    const g = c.createLinearGradient(0, top, 0, ty);
    g.addColorStop(0, "#f7f9fc");
    g.addColorStop(1, "#dfe6ef");
    c.fillStyle = g;
    c.fillRect(a, top, b - a, ty - top);
    // 墙砖
    c.strokeStyle = "rgba(120,140,170,.10)";
    c.lineWidth = 1;
    const tile = Math.max(14, 1.2 * vs);
    for (let m = mark - PLATFORM_LEN; m < mark + 4; m += 2.4) {
      const px = X(m);
      c.beginPath(); c.moveTo(px, top); c.lineTo(px, ty); c.stroke();
    }
    for (let y = top; y < ty; y += tile) {
      c.beginPath(); c.moveTo(a, y); c.lineTo(b, y); c.stroke();
    }
    // 吊顶与灯带
    c.fillStyle = "#3c4452";
    c.fillRect(a, top, b - a, H * 0.07);
    c.fillStyle = "#fffbe6";
    c.fillRect(a, H * 0.07 - 4, b - a, 4);
    // 线路色腰带
    c.fillStyle = line.color;
    c.fillRect(a, bodyTop - 0.25 * vs, b - a, 0.18 * vs);
    // 广告灯箱
    const ads = ["#ffcc80", "#80deea", "#c5e1a5", "#f48fb1", "#b39ddb"];
    let n = 0;
    for (let m = mark - PLATFORM_LEN + 14; m < mark - 4; m += 28, n++) {
      const x0 = X(m), w = 9 * sc, y0 = H * 0.07 + 0.25 * vs, h = 1.3 * vs;
      if (x0 > W || x0 + w < 0) continue;
      c.fillStyle = "#fff";
      c.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
      const ag = c.createLinearGradient(x0, y0, x0 + w, y0 + h);
      ag.addColorStop(0, ads[n % ads.length]);
      ag.addColorStop(1, ads[(n + 2) % ads.length]);
      c.fillStyle = ag;
      c.fillRect(x0, y0, w, h);
      c.fillStyle = "rgba(255,255,255,.7)";
      c.beginPath();
      c.arc(x0 + w * 0.25, y0 + h * 0.5, h * 0.28, 0, 7);
      c.fill();
    }
    // 站名牌
    const fs = clamp(vs * 0.62, 14, 34);
    c.font = `900 ${fs}px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const tw = c.measureText(name).width + fs * 2.6;
    const gap = Math.max(28, (tw * 1.6) / sc);
    for (let m = mark - PLATFORM_LEN + gap * 0.6; m < mark - 2; m += gap) {
      const cx = X(m), cy = bodyTop - 0.95 * vs;
      if (cx + tw < 0 || cx - tw > W) continue;
      c.fillStyle = "#1d2433";
      roundRect(c, cx - tw / 2, cy - fs * 0.85, tw, fs * 1.7, 6);
      c.fill();
      c.fillStyle = line.color;
      c.beginPath();
      c.arc(cx - tw / 2 + fs * 0.95, cy, fs * 0.6, 0, 7);
      c.fill();
      c.fillStyle = "#fff";
      c.font = `900 ${fs * 0.72}px sans-serif`;
      c.fillText(String(line.id), cx - tw / 2 + fs * 0.95, cy + 1);
      c.font = `900 ${fs}px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif`;
      c.fillText(name, cx + fs * 0.5, cy + 1);
    }
  });

  // ---------- 接触网 ----------
  c.strokeStyle = "#8d96a8";
  c.lineWidth = Math.max(1.5, vs * 0.05);
  c.beginPath(); c.moveTo(0, wireY); c.lineTo(W, wireY); c.stroke();
  const hang = 10 * sc;
  c.fillStyle = "#5c6475";
  for (let px = -((s.x * sc) % hang); px < W; px += hang) c.fillRect(px - 1, 0, 3, wireY);

  // ---------- 轨道 ----------
  c.fillStyle = "#3a3f4b";
  c.fillRect(0, ty, W, H - ty);
  const slp = 0.6 * sc * 1.5;
  c.fillStyle = "#5b6170";
  for (let px = -((s.x * sc) % slp); px < W; px += slp) c.fillRect(px, ty + 3, slp * 0.45, Math.max(4, vs * 0.16));
  c.fillStyle = "#c9ced8";
  c.fillRect(0, ty - 2, W, 4);
  c.fillStyle = "#7d8494";
  c.fillRect(0, ty + 2, W, 2);

  // ---------- 限速牌 ----------
  if (seg.limit) {
    [[seg.limit.from, String(seg.limit.kmh), "#e53935"], [seg.limit.to, "解除", "#43a047"]].forEach(([m, txt, col]) => {
      const px = X(m);
      if (px < -40 || px > W + 40) return;
      const r = clamp(vs * 0.55, 13, 26);
      const cy = bodyTop - 0.4 * vs;
      c.fillStyle = "#9aa3b5";
      c.fillRect(px - 2, cy, 4, ty - cy);
      c.beginPath(); c.arc(px, cy, r, 0, 7);
      c.fillStyle = "#fff"; c.fill();
      c.lineWidth = r * 0.24; c.strokeStyle = col; c.stroke();
      c.fillStyle = "#1d2433";
      c.font = `900 ${r * (txt.length > 2 ? 0.62 : 0.85)}px sans-serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(txt, px, cy + 1);
    });
  }

  drawTrain(c, W, H, s, { X, sc, vs, ty, bodyTop, bodyBot, wireY, line, terminal, doorsOpen });

  // ---------- 站台（前景）、站台门、候车乘客 ----------
  atStation.forEach(({ mark, a, b, on }) => {
    if (!on) return;
    const floor = bodyBot + 0.1 * vs;
    // 站台门：全高玻璃，门单元与列车车门一一对应
    const psdTop = bodyTop - 0.15 * vs;
    const dest = mark === seg.len;
    const open = dest ? doorsOpen : s.door;
    c.fillStyle = "rgba(190,225,255,.10)";
    c.fillRect(a, psdTop, b - a, floor - psdTop);
    c.fillStyle = "#aeb7c6";
    c.fillRect(a, psdTop - 0.32 * vs, b - a, 0.32 * vs);
    c.fillStyle = line.color;
    c.fillRect(a, psdTop - 0.32 * vs, b - a, 0.08 * vs);
    doorCenters(mark).forEach((m) => {
      const half = (DOOR_W / 2) * sc;
      const x = X(m);
      if (x + half * 2 < 0 || x - half * 2 > W) return;
      // 门头指示灯
      c.fillStyle = open > 0.05 ? "#ff9800" : "#4caf50";
      c.fillRect(x - half * 0.4, psdTop - 0.24 * vs, half * 0.8, 0.1 * vs);
      // 滑动门扇：淡淡的玻璃 + 细边框
      const slide = half * open;
      c.strokeStyle = "rgba(220,228,240,.25)";
      c.lineWidth = 1.5;
      [x - half - slide, x + slide].forEach((lx) => {
        c.fillStyle = "rgba(200,232,255,.08)";
        c.fillRect(lx, psdTop, half, floor - psdTop);
        c.strokeRect(lx, psdTop, half, floor - psdTop);
      });
    });
    // 站台地面
    const pg = c.createLinearGradient(0, floor, 0, H);
    pg.addColorStop(0, "#c9ced6");
    pg.addColorStop(1, "#9ea6b3");
    c.fillStyle = pg;
    c.fillRect(a, floor, b - a, H - floor);
    c.fillStyle = "#ffd400";
    c.fillRect(a, floor + 0.12 * vs, b - a, Math.max(4, 0.16 * vs));
    // 候车乘客（停准后上车，只剩一两位）
    const crowdAll = doorCenters(mark).filter((_, i) => i % 3 === 1);
    const crowd = mark === 0 || (dest && s.boarded) ? crowdAll.slice(0, 2) : crowdAll;
    crowd.forEach((m, i) => {
      const px = X(m);
      if (px < -30 || px > W + 30) return;
      person(c, px - 0.7 * sc, H - 4, clamp(vs * 1.7, 30, 80), LOOKS[i % LOOKS.length]);
      if (i % 2 === 0) person(c, px + 0.8 * sc, H - 2, clamp(vs * 1.3, 24, 62), LOOKS[(i + 3) % LOOKS.length]);
    });
  });

  // ---------- 停车标（站台末端） ----------
  const mx = X(seg.len);
  if (mx > -60 && mx < W + 60) {
    const top = bodyTop - 1.15 * vs;
    c.strokeStyle = "rgba(255,61,113,.8)";
    c.lineWidth = 3;
    c.setLineDash([8, 6]);
    c.beginPath(); c.moveTo(mx, top); c.lineTo(mx, H); c.stroke();
    c.setLineDash([]);
    const w = clamp(vs * 1.1, 26, 52), h = w * 1.15;
    c.fillStyle = "#fff";
    roundRect(c, mx - w / 2 - 3, top - h - 3, w + 6, h + 6, 8);
    c.fill();
    c.fillStyle = "#e53935";
    roundRect(c, mx - w / 2, top - h, w, h, 6);
    c.fill();
    c.fillStyle = "#fff";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `900 ${w * 0.55}px "PingFang SC","Microsoft YaHei",sans-serif`;
    c.fillText("停", mx, top - h * 0.6);
    c.font = `bold ${w * 0.26}px sans-serif`;
    c.fillText("6节", mx, top - h * 0.18);
  }
}

function drawTrain(c, W, H, s, o) {
  const { X, sc, vs, ty, bodyTop, bodyBot, wireY, line, terminal, doorsOpen } = o;
  const carW = CAR_LEN * sc;
  const bodyH = bodyBot - bodyTop;
  const winTop = bodyTop + 0.72 * vs, winBot = bodyTop + 1.72 * vs;
  const doorTop = bodyTop + 0.32 * vs;
  const fill = Math.min(1, s.load / 700);
  const doorOpen = Math.max(s.door, doorsOpen || 0);

  for (let i = CARS - 1; i >= 0; i--) {
    const x1 = X(s.x - i * CAR_LEN), x0 = x1 - carW;
    if (x1 < -carW || x0 > W + carW) continue;
    const front = i === 0, rear = i === CARS - 1;
    const nose = 1.6 * sc; // 驾驶室流线车头长度

    // 车体轮廓（不锈钢）
    c.save();
    c.beginPath();
    const r = 0.35 * vs;
    const L = x0 + 1, R = x1 - 1;
    if (rear) {
      c.moveTo(L + nose, bodyTop);
      c.lineTo(R - r, bodyTop);
    } else {
      c.moveTo(L + r, bodyTop);
      c.lineTo(front ? R - nose : R - r, bodyTop);
    }
    if (front) {
      c.bezierCurveTo(R - nose * 0.35, bodyTop, R, bodyTop + bodyH * 0.35, R, bodyTop + bodyH * 0.62);
      c.lineTo(R, bodyBot);
    } else {
      c.quadraticCurveTo(R, bodyTop, R, bodyTop + r);
      c.lineTo(R, bodyBot);
    }
    c.lineTo(L, bodyBot);
    if (rear) {
      c.lineTo(L, bodyTop + bodyH * 0.62);
      c.bezierCurveTo(L, bodyTop + bodyH * 0.35, L + nose * 0.35, bodyTop, L + nose, bodyTop);
    } else {
      c.lineTo(L, bodyTop + r);
      c.quadraticCurveTo(L, bodyTop, L + r, bodyTop);
    }
    c.closePath();
    const steel = c.createLinearGradient(0, bodyTop, 0, bodyBot);
    steel.addColorStop(0, "#fbfcfd");
    steel.addColorStop(0.45, "#e3e8ee");
    steel.addColorStop(0.8, "#c9d0da");
    steel.addColorStop(1, "#aeb6c2");
    c.fillStyle = steel;
    c.fill();
    c.clip();

    // 车顶
    c.fillStyle = "#9aa3b1";
    c.fillRect(x0, bodyTop, carW, 0.22 * vs);
    // 车窗：每两扇门之间一组大窗，乘客在窗里
    const half = (DOOR_W / 2) * sc;
    const gapM = Math.max(3, 0.25 * sc);
    const edges = [x0 + (front || rear ? 0 : 0.3 * sc), ...DOOR_POS.flatMap((f) => [x0 + carW * f - half, x0 + carW * f + half]), x1 - 0.3 * sc];
    const wins = [];
    for (let k = 0; k < edges.length; k += 2) {
      let a = edges[k] + gapM, b = edges[k + 1] - gapM;
      if (front && k === edges.length - 2) b = Math.min(b, x1 - nose * 1.35);
      if (rear && k === 0) a = Math.max(a, x0 + nose * 1.35);
      if (b - a > 6) wins.push([a, b]);
    }
    c.save();
    c.beginPath();
    wins.forEach(([a, b]) => { roundRect(c, a, winTop, b - a, winBot - winTop, 0.12 * vs); });
    const wg = c.createLinearGradient(0, winTop, 0, winBot);
    wg.addColorStop(0, "#fff4cf");
    wg.addColorStop(0.35, "#e9e2c8");
    wg.addColorStop(1, "#b8b29d");
    c.fillStyle = wg;
    c.fill();
    c.clip();
    // 乘客（人越多越挤）
    const heads = Math.round(18 * fill);
    for (let k = 0; k < heads; k++) {
      const hx = x0 + carW * ((k * 0.618 + i * 0.37) % 1);
      const hr = 0.2 * vs;
      const hy = winBot - hr * (1.2 + ((k * 7) % 3) * 0.25);
      c.fillStyle = ["#ff7043", "#42a5f5", "#ab47bc", "#66bb6a", "#ffca28", "#26c6da"][(k + i) % 6];
      c.fillRect(hx - hr * 1.1, hy + hr * 0.7, hr * 2.2, hr * 2);
      c.fillStyle = "#f6cfa8";
      c.beginPath(); c.arc(hx, hy, hr * 0.8, 0, 7); c.fill();
      c.fillStyle = ["#2b1d16", "#151515", "#5d4037"][(k + i) % 3];
      c.beginPath(); c.arc(hx, hy - hr * 0.15, hr * 0.82, Math.PI, 0); c.fill();
    }
    // 玻璃反光
    c.fillStyle = "rgba(40,60,90,.35)";
    c.fillRect(x0, winTop, carW, winBot - winTop);
    c.fillStyle = "rgba(255,255,255,.22)";
    c.beginPath();
    for (let k = 0; k < wins.length; k++) {
      const [a, b] = wins[k];
      c.moveTo(a + (b - a) * 0.15, winTop); c.lineTo(a + (b - a) * 0.35, winTop);
      c.lineTo(a + (b - a) * 0.15, winBot); c.lineTo(a - (b - a) * 0.05, winBot);
    }
    c.fill();
    c.restore();
    c.strokeStyle = "rgba(60,70,90,.55)";
    c.lineWidth = 1.5;
    wins.forEach(([a, b]) => { roundRect(c, a, winTop, b - a, winBot - winTop, 0.12 * vs); c.stroke(); });

    // 线路色涂装
    c.fillStyle = line.color;
    c.fillRect(x0, winBot + 0.22 * vs, carW, 0.34 * vs);
    c.fillRect(x0, winTop - 0.16 * vs, carW, 0.07 * vs);

    // 车门（双开塞拉门）
    DOOR_POS.forEach((f) => {
      const cx = x0 + carW * f;
      const slide = half * doorOpen;
      // 门洞（车厢内灯光）
      c.fillStyle = "#fff0c2";
      c.fillRect(cx - half, doorTop, half * 2, bodyBot - doorTop);
      [cx - half - slide, cx + slide].forEach((lx) => {
        const dg = c.createLinearGradient(0, doorTop, 0, bodyBot);
        dg.addColorStop(0, "#eef1f5");
        dg.addColorStop(1, "#c3cad5");
        c.fillStyle = dg;
        c.fillRect(lx, doorTop, half, bodyBot - doorTop);
        c.fillStyle = "#33465f";
        roundRect(c, lx + half * 0.2, winTop, half * 0.6, (winBot - winTop) * 1.1, 0.08 * vs);
        c.fill();
      });
      c.fillStyle = "rgba(60,70,90,.6)";
      c.fillRect(cx - half - 1, doorTop, 2, bodyBot - doorTop);
      c.fillRect(cx + half - 1, doorTop, 2, bodyBot - doorTop);
      if (doorOpen < 0.05) c.fillRect(cx - 0.5, doorTop, 1, bodyBot - doorTop);
      // 门灯
      c.fillStyle = doorOpen > 0.02 ? "#ffb300" : "#6b7380";
      c.fillRect(cx - half * 0.35, doorTop - 0.16 * vs, half * 0.7, 0.08 * vs);
    });

    // 驾驶室
    const drawCab = (dir) => {
      const ex = dir > 0 ? R : L;
      // 前窗
      c.fillStyle = "#121a26";
      c.beginPath();
      c.moveTo(ex - dir * nose * 1.25, bodyTop + 0.3 * vs);
      c.lineTo(ex - dir * nose * 0.45, bodyTop + 0.3 * vs);
      c.quadraticCurveTo(ex - dir * 0.15 * sc, bodyTop + bodyH * 0.25, ex - dir * 0.05 * sc, winBot + 0.1 * vs);
      c.lineTo(ex - dir * nose * 1.25, winBot + 0.1 * vs);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,.18)";
      c.beginPath();
      c.moveTo(ex - dir * nose * 1.1, bodyTop + 0.4 * vs);
      c.lineTo(ex - dir * nose * 0.75, bodyTop + 0.4 * vs);
      c.lineTo(ex - dir * nose * 1.0, winBot);
      c.lineTo(ex - dir * nose * 1.15, winBot);
      c.closePath();
      c.fill();
      // 车灯
      const ly = bodyBot - 0.5 * vs;
      c.fillStyle = dir > 0 ? "#fffde7" : "#ff1744";
      c.beginPath();
      c.ellipse(ex - dir * 0.25 * sc, ly, Math.max(2.5, 0.12 * sc), Math.max(3, 0.11 * vs), 0, 0, 7);
      c.fill();
      // 车头下方线路色裙板
      c.fillStyle = line.color;
      c.fillRect(Math.min(ex, ex - dir * nose * 1.3), bodyBot - 0.3 * vs, nose * 1.3, 0.3 * vs);
    };
    if (front) drawCab(1);
    if (rear) drawCab(-1);
    c.restore();

    // 车顶设备：空调机组、受电弓
    c.fillStyle = "#7d8695";
    roundRect(c, x0 + carW * 0.18, bodyTop - 0.28 * vs, carW * 0.22, 0.3 * vs, 4);
    c.fill();
    roundRect(c, x0 + carW * 0.6, bodyTop - 0.28 * vs, carW * 0.22, 0.3 * vs, 4);
    c.fill();
    if (i === 1 || i === 4) {
      const px = x0 + carW * 0.5;
      c.strokeStyle = "#3c4350";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(px - 1.2 * sc, bodyTop - 0.05 * vs);
      c.lineTo(px + 0.4 * sc, (bodyTop + wireY) / 2);
      c.lineTo(px - 0.4 * sc, wireY + 2);
      c.stroke();
      c.fillStyle = "#3c4350";
      c.fillRect(px - 1.1 * sc, wireY, 1.6 * sc, 3);
    }
    // 车厢连接处（风挡）
    if (!rear) {
      c.fillStyle = "#3b414d";
      c.fillRect(x0 - 3, bodyTop + 0.45 * vs, 5, bodyH - 0.6 * vs);
    }
    // 转向架和车轮
    [0.17, 0.83].forEach((f) => {
      const bx = x0 + carW * f;
      c.fillStyle = "#2b2f38";
      const bw = Math.max(3 * sc, 0.42 * vs * 4.4);
      roundRect(c, bx - bw / 2, bodyBot, bw, 0.45 * vs, 3);
      c.fill();
      const wr = 0.42 * vs, dx = Math.max(0.95 * sc, wr * 1.15);
      [-1, 1].forEach((d) => {
        const wx = bx + d * dx, wy = ty - wr;
        c.fillStyle = "#1a1d23";
        c.beginPath(); c.arc(wx, wy, wr, 0, 7); c.fill();
        c.strokeStyle = "#8c93a0";
        c.lineWidth = 1.5;
        const ang = -(s.x / 0.42) % (Math.PI * 2);
        c.beginPath();
        c.moveTo(wx + Math.cos(ang) * wr * 0.75, wy + Math.sin(ang) * wr * 0.75);
        c.lineTo(wx - Math.cos(ang) * wr * 0.75, wy - Math.sin(ang) * wr * 0.75);
        c.stroke();
        c.fillStyle = "#8c93a0";
        c.beginPath(); c.arc(wx, wy, wr * 0.25, 0, 7); c.fill();
      });
    });
    // 车底设备箱
    c.fillStyle = "#3a3f4b";
    c.fillRect(x0 + carW * 0.3, bodyBot, carW * 0.4, 0.32 * vs);

    // 车头 LED 目的地显示屏 + 车灯光束
    if (front) {
      const ex = R;
      const ledW = 3.2 * sc, ledH = 0.32 * vs;
      const lx = ex - nose * 1.25 - ledW * 0.1, ly = bodyTop + 0.02 * vs + ledH * 0.1;
      c.fillStyle = "#0b0b0b";
      roundRect(c, lx - ledW, ly, ledW, ledH, 3);
      c.fill();
      c.fillStyle = "#ffb300";
      c.font = `bold ${Math.max(9, ledH * 0.75)}px "PingFang SC","Microsoft YaHei",sans-serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(`${line.id}号线 ${terminal}`, lx - ledW / 2, ly + ledH / 2 + 1, ledW - 6);
      if (s.v > 0.3) {
        const beam = c.createLinearGradient(ex, 0, ex + 14 * sc, 0);
        beam.addColorStop(0, "rgba(255,250,210,.35)");
        beam.addColorStop(1, "rgba(255,250,210,0)");
        c.fillStyle = beam;
        c.beginPath();
        c.moveTo(ex, bodyBot - 0.6 * vs);
        c.lineTo(ex + 14 * sc, bodyBot - 1.6 * vs);
        c.lineTo(ex + 14 * sc, ty + 0.2 * vs);
        c.lineTo(ex, bodyBot - 0.35 * vs);
        c.closePath();
        c.fill();
      }
    }
  }

  // 车头对准箭头
  const hx = X(s.x);
  c.fillStyle = "#00e676";
  c.strokeStyle = "#0b3d23";
  c.lineWidth = 2;
  const ay = bodyTop - 1.0 * vs;
  c.beginPath();
  c.moveTo(hx, ay + 14); c.lineTo(hx - 10, ay); c.lineTo(hx + 10, ay);
  c.closePath(); c.fill(); c.stroke();
}
