// 成绩海报：画在 canvas 上，带二维码，方便长按保存后发微信
import QRCode from "qrcode";

// 正式网址：在自己的域名上打开时用当前地址，其他地方（预览等）用这个
export const SITE_URL = "http://ditie.gmgnclaw.com";
export function siteUrl() {
  if (typeof location !== "undefined" && /gmgnclaw\.com$/.test(location.hostname)) return location.origin;
  return SITE_URL;
}

const W = 750, H = 1200;
const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
const DISPLAY = '"ZCOOL KuaiLe",' + FONT;

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export async function makePoster({ line, trip, name, results, title, dailyKey, rank }) {
  try { await document.fonts.load('80px "ZCOOL KuaiLe"', "地铁冲冲冲我在开"); } catch (e) {}
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");

  // 背景
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#9fd6ff");
  bg.addColorStop(0.45, "#dff1ff");
  bg.addColorStop(1, "#ffffff");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  // 底部轨道装饰
  c.fillStyle = "#c9ced8";
  c.fillRect(0, H - 22, W, 6);
  for (let x = 0; x < W; x += 30) { c.fillStyle = "#9aa3b1"; c.fillRect(x, H - 16, 14, 10); }

  // 标题
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `86px ${DISPLAY}`;
  c.lineWidth = 10;
  c.strokeStyle = "#1d2a4d";
  c.strokeText("地铁冲冲冲！", W / 2, 96);
  c.fillStyle = "#ffcf33";
  c.fillText("地铁冲冲冲！", W / 2, 96);
  c.font = `bold 28px ${FONT}`;
  c.fillStyle = "#1d2a4d";
  c.fillText(
    dailyKey ? `📅 每日挑战 · ${dailyKey}${rank ? ` · 全城第 ${rank.rank} 名` : ""}` : "我在合肥开地铁啦！",
    W / 2, 168, W - 60,
  );

  // 成绩卡
  const cx = 40, cy = 210, cw = W - 80, ch = 640;
  c.shadowColor = "rgba(29,42,77,.18)"; c.shadowBlur = 24; c.shadowOffsetY = 8;
  c.fillStyle = "#fff";
  rr(c, cx, cy, cw, ch, 36); c.fill();
  c.shadowColor = "transparent";
  c.fillStyle = line.color;
  rr(c, cx, cy, cw, 16, 8); c.fill();

  // 线路与区间
  c.fillStyle = line.color;
  c.beginPath(); c.arc(cx + 80, cy + 92, 44, 0, 7); c.fill();
  c.fillStyle = "#fff";
  c.font = `900 52px ${FONT}`;
  c.fillText(String(line.id), cx + 80, cy + 95);
  c.textAlign = "left";
  c.fillStyle = "#1d2a4d";
  c.font = `bold 38px ${FONT}`;
  c.fillText(`合肥地铁${line.name}`, cx + 144, cy + 72);
  c.fillStyle = "#5a6788";
  c.font = `28px ${FONT}`;
  const from = trip.names[0], to = trip.names[trip.names.length - 1];
  c.fillText(`${from} → ${to} · ${results.length} 站`, cx + 144, cy + 116, cw - 170);

  // 司机与人数
  c.textAlign = "center";
  c.fillStyle = "#1d2a4d";
  c.font = `bold 34px ${FONT}`;
  c.fillText(`🧑‍✈️ ${name}  ${title}`, W / 2, cy + 196, cw - 40);
  const passengers = results[results.length - 1].onboard;
  c.font = `150px ${DISPLAY}`;
  c.fillStyle = "#e88a00";
  c.fillText(String(passengers), W / 2, cy + 315);
  c.font = `bold 32px ${FONT}`;
  c.fillStyle = "#1d2a4d";
  c.fillText("位乘客跟我一起到站", W / 2, cy + 410);

  // 统计
  const precise = results.filter((r) => r.kind === "precise").length;
  const score = results.reduce((s, r) => s + r.total, 0);
  const stats = [["🎯 精准停车", `${precise}/${results.length}`], ["🏁 驾驶分", String(score)]];
  stats.forEach(([k, v], i) => {
    const x = cx + 40 + i * ((cw - 80) / 2 + 0), w = (cw - 100) / 2;
    c.fillStyle = i ? "#fff7d1" : "#dcfce7";
    rr(c, x + (i ? 20 : 0), cy + 450, w, 96, 22); c.fill();
    c.fillStyle = "#5a6788";
    c.font = `26px ${FONT}`;
    c.fillText(k, x + (i ? 20 : 0) + w / 2, cy + 478);
    c.fillStyle = "#1d2a4d";
    c.font = `bold 40px ${FONT}`;
    c.fillText(v, x + (i ? 20 : 0) + w / 2, cy + 520);
  });

  // 每站停车情况（彩色圆点）
  const colors = { precise: "#22c55e", rough: "#f59e0b", missed: "#ef4444" };
  const n = results.length;
  const gap = Math.min(80, (cw - 80) / Math.max(1, n - 1));
  const startX = W / 2 - (gap * (n - 1)) / 2;
  c.strokeStyle = line.color; c.lineWidth = 6;
  c.beginPath(); c.moveTo(startX, cy + 592); c.lineTo(startX + gap * (n - 1), cy + 592); c.stroke();
  results.forEach((r, i) => {
    c.fillStyle = colors[r.kind];
    c.beginPath(); c.arc(startX + gap * i, cy + 592, 15, 0, 7); c.fill();
    c.strokeStyle = "#fff"; c.lineWidth = 4; c.stroke();
  });
  c.fillStyle = "#5a6788";
  c.font = `22px ${FONT}`;
  c.fillText("● 绿 精准   ● 黄 没停准   ● 红 冲过站", W / 2, cy + 626);

  // 二维码
  const url = siteUrl();
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { width: 220, margin: 1, color: { dark: "#1d2a4d", light: "#ffffff" } });
  const qy = cy + ch + 40;
  c.fillStyle = "#fff";
  rr(c, 60, qy, 260, 260, 24); c.fill();
  c.drawImage(qr, 80, qy + 20, 220, 220);
  c.textAlign = "left";
  c.fillStyle = "#1d2a4d";
  c.font = `52px ${DISPLAY}`;
  c.fillText("你也来试试？", 350, qy + 70);
  c.font = `bold 28px ${FONT}`;
  c.fillText("扫码开合肥地铁 1–7 号线", 350, qy + 130);
  c.fillStyle = "#5a6788";
  c.font = `24px ${FONT}`;
  c.fillText("精准停车，接最多的乘客", 350, qy + 172);
  c.fillText(url.replace(/^https?:\/\//, ""), 350, qy + 214);

  return cv.toDataURL("image/png");
}
