import { useEffect, useRef, useState } from "react";
import { LEVELS, PINYIN, transfersAt } from "../lib/lines";
import { sfx, speak } from "../lib/sound";

const ACC = 2.4; // 加速 m/s²
const BRK = 3.2; // 刹车 m/s²
const DRAG = 0.12; // 滑行时的阻力
const TRAIN_LEN = 92;
const CARS = 4;

const CN_NUM = "零一二三四五六七八九";
const EN_NUM = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const lineNum = (name) => parseInt(name, 10);
const py = (station) => PINYIN[station] || station;
// 换乘线路：中文 “轨道交通二号线、五号线”，英文 “Line Two and Line Five”
const cnTransfer = (list) => "轨道交通" + list.map((n) => CN_NUM[lineNum(n)] + "号线").join("、");
const enTransfer = (list) =>
  list.map((n) => "Line " + EN_NUM[lineNum(n)]).join(", ").replace(/, ([^,]*)$/, " and $1");

// 合肥地铁式播报词
function departCall(to, terminal, tr, courtesy) {
  const last = to === terminal;
  const zh = `本次列车开往${terminal}方向，下一站${last ? "，终点站" : ""}${to}` +
    `${tr.length ? "，可换乘" + cnTransfer(tr) : ""}。请刚上车的乘客往车厢中部走，要下车的乘客请提前做好准备。` +
    (courtesy ? "各位尊敬的乘客，使用电子设备时请勿外放声音，感谢您的配合。" : "");
  const en = `This train is bound for ${py(terminal)}. The next stop is ${py(to)}` +
    `${last ? ", the terminal station" : ""}.` +
    `${tr.length ? " You can transfer to " + enTransfer(tr) + "." : ""} Please get ready for your arrival.`;
  return { zh, en };
}
function arriveCall(to, terminal, tr, door) {
  const side = door === "左" ? "left" : "right";
  if (to === terminal) {
    return {
      zh: `终点站${to}到了，请带好随身物品，从列车前进方向${door}侧车门下车。` +
        `${tr.length ? "本站可换乘" + cnTransfer(tr) + "。" : ""}感谢您乘坐合肥轨道交通。`,
      en: `We are arriving at the terminal station, ${py(to)}. Please take all your belongings ` +
        `and leave from the ${side} side.${tr.length ? " You can transfer to " + enTransfer(tr) + "." : ""}`,
    };
  }
  return {
    zh: `${to}到了，请从列车前进方向${door}侧车门下车。${tr.length ? "本站可换乘" + cnTransfer(tr) + "。" : ""}`,
    en: `We are arriving at ${py(to)}. Please leave from the ${side} side.` +
      `${tr.length ? " You can transfer to " + enTransfer(tr) + "." : ""}`,
  };
}

function parTime(len, vm) {
  return (len / vm + vm / 4 + vm / 6.4) * 1.15 + 3;
}

// 驾驶画面：负责一位小司机的一整趟行程
export default function Drive({ line, trip, player, onFinish, onQuit }) {
  const lv = LEVELS[line.level];
  const vm = lv.vmax / 3.6;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const input = useRef({ acc: false, brk: false });
  const g = useRef(null);
  const results = useRef([]);
  const [segIdx, setSegIdx] = useState(0);
  const [phase, setPhase] = useState("ready");
  const [card, setCard] = useState(null);
  const [hud, setHud] = useState({ kmh: 0, dist: 0, hint: "go", tip: "", limit: null, over: false, off: null });
  const [banner, setBanner] = useState({ zh: "", en: "" });
  const total = results.current.reduce((s, r) => s + r.total, 0);

  const seg = trip.segs[segIdx];

  function announce({ zh, en }) {
    setBanner({ zh, en });
    speak(zh, en);
  }

  // 每到一个新区间：重置列车，播报下一站
  useEffect(() => {
    g.current = {
      phase: "ready", x: 0, v: 0, t: 0, dwell: 0, over: 0, door: segIdx === 0 ? 0 : 1,
      warnAt: 0, hudAt: 0, tip: "",
    };
    setPhase("ready");
    setCard(null);
    sfx.doorClose();
    announce(departCall(seg.to, trip.terminal, transfersAt(seg.to, line.id), segIdx % 2 === 1));
  }, [segIdx]);

  function judge(missed) {
    const s = g.current;
    const err = s.x - seg.len;
    const abs = Math.abs(err);
    let precision = 0, stars = 0, title = "冲过站啦！";
    if (!missed) {
      precision = abs <= 0.5 ? 100 : Math.max(10, Math.round(100 * (1 - (abs - 0.5) / (lv.tol - 0.5))));
      stars = precision >= 90 ? 3 : precision >= 60 ? 2 : 1;
      title = abs <= 0.5 ? "完美停车！" : stars === 3 ? "超级准！" : stars === 2 ? "很不错！" : "停偏了一点";
    }
    const late = s.t - parTime(seg.len, vm);
    const bonus = missed ? 0 : Math.round(Math.max(0, Math.min(20, 20 - late * 2)));
    const penalty = Math.min(30, Math.floor(s.over * 4));
    const sum = missed ? 0 : Math.max(0, precision + bonus - penalty);
    const r = { station: seg.to, err, precision, bonus, penalty, total: sum, stars, title, missed, time: s.t };
    results.current.push(r);
    s.phase = "doors";
    setPhase("doors");
    setCard(r);
    if (missed) {
      sfx.miss();
      announce({ zh: `哎呀，列车冲过了${seg.to}站！下次记得早一点刹车哦。`, en: "" });
    } else {
      sfx.chime();
      setTimeout(() => (stars === 3 ? sfx.perfect() : sfx.good()), 900);
      announce(arriveCall(seg.to, trip.terminal, transfersAt(seg.to, line.id), seg.door));
    }
  }

  function next() {
    if (g.current.phase !== "doors") return;
    if (segIdx === trip.segs.length - 1) onFinish(results.current);
    else setSegIdx(segIdx + 1);
  }
  const nextRef = useRef(next);
  nextRef.current = next;
  const judgeRef = useRef(judge);
  judgeRef.current = judge;

  // 键盘操作
  useEffect(() => {
    const set = (e, down) => {
      const k = e.key;
      if (k === "ArrowUp" || k === "ArrowRight" || k === "w" || k === "W") input.current.acc = down;
      else if (k === "ArrowDown" || k === "ArrowLeft" || k === "s" || k === "S" || k === " ") input.current.brk = down;
      else if (k === "Enter" && down) nextRef.current();
      else return;
      e.preventDefault();
    };
    const kd = (e) => set(e, true);
    const ku = (e) => set(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  // 主循环：物理 + 画面
  useEffect(() => {
    const canvas = canvasRef.current;
    const c = canvas.getContext("2d");
    let W = 0, H = 0, raf = 0, prev = performance.now();

    const resize = () => {
      const r = wrapRef.current.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      W = r.width; H = r.height;
      canvas.width = W * d; canvas.height = H * d;
      c.setTransform(d, 0, 0, d, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const step = (dt, now) => {
      const s = g.current;
      const inp = input.current;
      if (s.phase === "ready" && inp.acc) { s.phase = "run"; setPhase("run"); }
      if (s.phase === "run" || s.phase === "missed") {
        let a = 0;
        if (s.phase === "missed" || inp.brk) a = -BRK;
        else if (inp.acc) a = ACC * (1 - Math.pow(s.v / vm, 3) * 0.7);
        else a = -DRAG;
        s.v = Math.max(0, Math.min(vm, s.v + a * dt));
        s.x += s.v * dt;
        if (s.phase === "run") s.t += dt;
        const remain = seg.len - s.x;

        if (s.phase === "run") {
          // 限速区
          const lim = seg.limit;
          if (lim && s.x > lim.from && s.x < lim.to && s.v * 3.6 > lim.kmh + 2) {
            s.over += dt;
            if (now > s.warnAt) { sfx.warn(); s.warnAt = now + 400; }
          }
          if (remain < -lv.tol) { s.phase = "missed"; setPhase("missed"); }
          else if (s.v === 0) {
            if (Math.abs(remain) <= lv.tol) {
              s.dwell += dt;
              s.tip = "停稳啦，正在开门…";
              if (s.dwell > 0.7) judgeRef.current(false);
            } else { s.dwell = 0; s.tip = "还没到停车点，继续往前开！"; }
          } else { s.dwell = 0; s.tip = ""; }
        } else if (s.v === 0) judgeRef.current(true);
      }
      if (s.phase === "ready") s.door = Math.max(0, s.door - dt * 1.5);
      if (s.phase === "doors" && !results.current[results.current.length - 1].missed)
        s.door = Math.min(1, s.door + dt * 1.5);

      if (now > s.hudAt) {
        s.hudAt = now + 70;
        const remain = seg.len - s.x;
        const stopD = (s.v * s.v) / (2 * BRK);
        let hint = "go";
        if (remain < stopD + s.v * 0.5 + 3) hint = "brake";
        else if (remain < stopD * 1.5 + 45) hint = "slow";
        const lim = seg.limit;
        let limit = null, over = false;
        if (lim && s.x > lim.from - 160 && s.x < lim.to) {
          limit = lim.kmh;
          over = s.v * 3.6 > lim.kmh + 2;
          if (over && s.x < lim.from && hint === "go") hint = "slow";
        }
        setHud({
          kmh: Math.round(s.v * 3.6), dist: Math.max(0, Math.round(remain)), hint,
          tip: s.phase === "ready" ? "按住【加速】发车！" : s.tip, limit,
          over: over && s.x > lim.from,
          off: Math.abs(remain) < 60 ? -remain : null,
        });
      }
    };

    const draw = () => {
      const s = g.current;
      const sc = Math.max(2.4, Math.min(6, W / 170)); // 每米多少像素
      const headX = W * 0.7;
      const ty = H * 0.74; // 轨道高度
      const th = Math.max(44, Math.min(96, H * 0.24)); // 车身高度
      const X = (m) => headX + (m - s.x) * sc;

      // 隧道
      const bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0b1030");
      bg.addColorStop(1, "#1b2452");
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      // 隧道灯（远景，移动得慢一点）
      const gap = 90;
      const off = (s.x * sc * 0.6) % gap;
      for (let px = -off; px < W + gap; px += gap) {
        c.fillStyle = "rgba(255,230,150,.55)";
        c.fillRect(px, H * 0.16, 26, 5);
        c.fillStyle = "rgba(255,255,255,.05)";
        c.fillRect(px + 40, H * 0.3, 3, ty - H * 0.3);
      }

      // 车站（背景墙 + 站名牌）
      [[0, seg.from], [seg.len, seg.to]].forEach(([mark, name]) => {
        const x0 = X(mark - 108), x1 = X(mark + 14);
        if (x1 < 0 || x0 > W) return;
        c.fillStyle = "#e9f1ff";
        c.fillRect(x0, H * 0.08, x1 - x0, ty - H * 0.08);
        c.fillStyle = line.color;
        c.fillRect(x0, H * 0.08, x1 - x0, 8);
        c.fillRect(x0, ty - th - 26, x1 - x0, 5);
        for (let m = mark - 96; m < mark + 10; m += 24) {
          c.fillStyle = "#c9d6ee";
          c.fillRect(X(m) - 5, H * 0.08 + 8, 10, ty - H * 0.08);
        }
        const fs = Math.max(14, Math.min(26, H * 0.06));
        c.font = `bold ${fs}px sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        const tw = c.measureText(name).width + 28;
        for (let m = mark - 84; m < mark + 10; m += 48) {
          const cx = X(m + 12), cy = H * 0.08 + 14 + fs;
          c.fillStyle = "#fff";
          c.strokeStyle = line.color;
          c.lineWidth = 3;
          c.beginPath();
          c.rect(cx - tw / 2, cy - fs * 0.85, tw, fs * 1.7);
          c.fill(); c.stroke();
          c.fillStyle = "#1b2452";
          c.fillText(name, cx, cy);
        }
      });

      // 轨道
      c.fillStyle = "#39406b";
      c.fillRect(0, ty, W, H - ty);
      const so = (s.x * sc) % 22;
      c.fillStyle = "#565d8a";
      for (let px = -so; px < W; px += 22) c.fillRect(px, ty + 4, 9, 7);
      c.fillStyle = "#aab3d8";
      c.fillRect(0, ty, W, 4);

      // 限速区
      if (seg.limit) {
        const a = X(seg.limit.from), b = X(seg.limit.to);
        if (b > 0 && a < W) {
          c.fillStyle = "rgba(255,160,0,.75)";
          c.fillRect(a, ty, b - a, 4);
          [[a, String(seg.limit.kmh), "#e53935"], [b, "✓", "#43a047"]].forEach(([px, txt, col]) => {
            c.fillStyle = "#cfd6f5";
            c.fillRect(px - 2, ty - th - 40, 4, th + 40);
            c.beginPath();
            c.arc(px, ty - th - 44, 17, 0, 7);
            c.fillStyle = "#fff"; c.fill();
            c.lineWidth = 4; c.strokeStyle = col; c.stroke();
            c.fillStyle = "#222";
            c.font = "bold 15px sans-serif";
            c.textAlign = "center"; c.textBaseline = "middle";
            c.fillText(txt, px, ty - th - 43);
          });
        }
      }

      // 列车
      const tx1 = headX, tx0 = headX - TRAIN_LEN * sc;
      const top = ty - th - 4, bot = ty - 5;
      const carW = (TRAIN_LEN * sc) / CARS;
      for (let i = 0; i < CARS; i++) {
        const cx = tx0 + i * carW;
        const isHead = i === CARS - 1;
        c.fillStyle = "#f6f8ff";
        c.beginPath();
        const r = isHead ? th * 0.55 : 6;
        c.moveTo(cx + 2, bot);
        c.lineTo(cx + 2, top + 6);
        c.quadraticCurveTo(cx + 2, top, cx + 8, top);
        c.lineTo(cx + carW - 2 - r, top);
        c.quadraticCurveTo(cx + carW - 2, top, cx + carW - 2, top + r);
        c.lineTo(cx + carW - 2, bot);
        c.closePath();
        c.fill();
        c.fillStyle = line.color;
        c.fillRect(cx + 2, bot - th * 0.26, carW - 4, th * 0.14);
        // 车窗和车门
        const wy = top + th * 0.2, wh = th * 0.34;
        const dw = carW * 0.13;
        [0.2, 0.62].forEach((p) => {
          const dx = cx + carW * p;
          c.fillStyle = "#33406e";
          c.fillRect(dx, wy - 3, dw, bot - wy - 1);
          if (s.door > 0) {
            c.fillStyle = "#ffe9a8";
            c.fillRect(dx + (dw / 2) * (1 - s.door), wy - 3, dw * s.door, bot - wy - 1);
          }
        });
        c.fillStyle = "#8fd3ff";
        [0.05, 0.37, 0.79].forEach((p, j) => {
          const ww = carW * (j === 1 ? 0.21 : 0.11);
          if (isHead && j === 2) return;
          c.fillRect(cx + carW * p, wy, ww, wh);
        });
        if (isHead) {
          c.fillStyle = "#22305c";
          c.beginPath();
          c.moveTo(cx + carW * 0.8, wy - 2);
          c.lineTo(cx + carW - 2 - r * 0.55, wy - 2);
          c.quadraticCurveTo(cx + carW - 5, wy, cx + carW - 5, wy + wh);
          c.lineTo(cx + carW * 0.8, wy + wh);
          c.closePath();
          c.fill();
          c.fillStyle = "#fff59d";
          c.beginPath();
          c.arc(cx + carW - 7, bot - th * 0.13, 4, 0, 7);
          c.fill();
        }
      }
      // 车轮
      c.fillStyle = "#1a1f3d";
      for (let i = 0; i < CARS; i++)
        [0.18, 0.82].forEach((p) => {
          c.beginPath();
          c.arc(tx0 + (i + p) * carW, ty - 3, 5, 0, 7);
          c.fill();
        });

      // 前景站台 + 停车标
      [0, seg.len].forEach((mark) => {
        const x0 = X(mark - 108), x1 = X(mark + 14);
        if (x1 < 0 || x0 > W) return;
        const py = ty + 16;
        c.fillStyle = "#d7deef";
        c.fillRect(x0, py, x1 - x0, H - py);
        c.fillStyle = "#ffd600";
        c.fillRect(x0, py, x1 - x0, 6);
        c.font = `${Math.min(26, (H - py) * 0.5)}px sans-serif`;
        c.textAlign = "center"; c.textBaseline = "middle";
        ["🧒", "👧", "👨‍🦱", "👩", "👦", "🧓"].forEach((p, i) =>
          c.fillText(p, X(mark - 96 + i * 17), py + (H - py) * 0.55));
      });
      const mx = X(seg.len);
      if (mx > -40 && mx < W + 40) {
        c.strokeStyle = "#ff3d71";
        c.lineWidth = 3;
        c.setLineDash([7, 6]);
        c.beginPath(); c.moveTo(mx, top - 34); c.lineTo(mx, ty + 16); c.stroke();
        c.setLineDash([]);
        c.fillStyle = "#ff3d71";
        c.beginPath();
        c.arc(mx, top - 46, 17, 0, 7);
        c.fill();
        c.fillStyle = "#fff";
        c.font = "bold 18px sans-serif";
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText("停", mx, top - 45);
      }
      // 车头对准标记
      c.fillStyle = "#00e676";
      c.beginPath();
      c.moveTo(tx1 - 2, top - 6); c.lineTo(tx1 - 10, top - 20); c.lineTo(tx1 + 6, top - 20);
      c.closePath(); c.fill();
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (g.current) { step(dt, now); draw(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [segIdx]);

  const hold = (key) => ({
    onPointerDown: (e) => { e.preventDefault(); sfx.unlock(); input.current[key] = true; },
    onPointerUp: () => { input.current[key] = false; },
    onPointerLeave: () => { input.current[key] = false; },
    onPointerCancel: () => { input.current[key] = false; },
    onContextMenu: (e) => e.preventDefault(),
  });

  const hintText = { go: "🟢 加速前进", slow: "🟡 准备减速", brake: "🔴 快刹车！" }[hud.hint];
  const last = segIdx === trip.segs.length - 1;

  return (
    <div className="drive">
      <div className="topbar">
        <button className="mini" onClick={onQuit}>✕ 退出</button>
        <span className="badge" style={{ background: line.color }}>{line.name}</span>
        <span className="who">🧑‍✈️ {player}</span>
        <span className="next">下一站：<b>{seg.to}</b></span>
        <span className="score">得分 <b>{total}</b></span>
      </div>
      <div className={"dots" + (trip.names.length > 6 ? " many" : "")}>
        {trip.names.map((n, i) => (
          <span key={i} className={"dot" + (i <= segIdx ? " done" : "") + (i === segIdx + 1 ? " cur" : "")}
            style={i <= segIdx ? { background: line.color, borderColor: line.color } : i === segIdx + 1 ? { borderColor: line.color } : null}>
            <i>{n}</i>
          </span>
        ))}
      </div>
      <div className="banner">📢 {banner.zh}{banner.en && <small>{banner.en}</small>}</div>

      <div className="scene" ref={wrapRef}>
        <canvas ref={canvasRef} />
        <div className="gauges">
          <div className={"speed" + (hud.over ? " over" : "")}>
            <b>{hud.kmh}</b><small>km/h</small>
          </div>
          <div className="dist">距停车点<br /><b>{hud.dist}</b> 米</div>
          {hud.limit && <div className={"limit" + (hud.over ? " over" : "")}>{hud.limit}</div>}
          {lv.hint && phase === "run" && <div className={"hint " + hud.hint}>{hintText}</div>}
        </div>
        {hud.off !== null && phase !== "doors" && (
          <div className="aim">
            <div className="zone" style={{ width: `${(lv.tol / 60) * 100}%` }} />
            <div className="center" />
            <div className="ptr" style={{ left: `${50 + Math.max(-1, Math.min(1, hud.off / 60)) * 50}%` }}>🚇</div>
          </div>
        )}
        {hud.tip && phase !== "doors" && <div className="tip">{hud.tip}</div>}
        {phase === "missed" && <div className="tip bad">冲过站啦！紧急刹车中…</div>}

        {card && (
          <div className="card">
            <h2 className={card.missed ? "bad" : ""}>{card.title}</h2>
            <div className="stars">{"⭐".repeat(card.stars)}{"☆".repeat(3 - card.stars)}</div>
            {!card.missed && (
              <p className="err">
                {Math.abs(card.err) <= 0.5 ? "分毫不差！" : card.err < 0 ? "离停车点还差 " : "超过停车点 "}
                {Math.abs(card.err) > 0.5 && <b>{Math.abs(card.err).toFixed(1)} 米</b>}
              </p>
            )}
            <table>
              <tbody>
                <tr><td>🎯 停车准度</td><td>+{card.precision}</td></tr>
                <tr><td>⏱ 准点奖励（{card.time.toFixed(0)} 秒）</td><td>+{card.bonus}</td></tr>
                {card.penalty > 0 && <tr><td>⚠️ 超速扣分</td><td>-{card.penalty}</td></tr>}
                <tr className="sum"><td>本站得分</td><td>{card.total}</td></tr>
              </tbody>
            </table>
            <button className="big go" onClick={next}>{last ? "看成绩 🏁" : "关门发车 ▶"}</button>
          </div>
        )}
      </div>

      <div className="controls">
        <button className="big brake" {...hold("brk")}>🛑 刹车<small>↓ / 空格</small></button>
        <button className="big go" {...hold("acc")}>🚀 加速<small>↑ 键</small></button>
      </div>
    </div>
  );
}
