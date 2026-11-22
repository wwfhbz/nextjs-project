import { useEffect, useRef, useState } from "react";
import { LEVELS, transfersAt } from "../lib/lines";
import { say, sfx, speak } from "../lib/sound";
import { drawScene } from "./scene";
import { START_PASSENGERS, RULES, stopOutcome, WRONG_DOOR_PENALTY, LATE_BONUS, EVENT_BONUS, EVENT_PENALTY } from "../lib/rules";

const ACC = 2.4; // 加速 m/s²
const BRK = 3.2; // 刹车 m/s²
const DRAG = 0.12; // 滑行时的阻力
// 乘客规则在 lib/rules.js（和排行榜服务器共用）
export { START_PASSENGERS, RULES };
const EVENT_TIME = 6; // 小事件要在几秒内处理
const EVENTS = {
  intercom: { icon: "📢", btn: "广播安抚", zh: "3 号车厢有乘客按下了紧急呼叫！请司机马上广播安抚乘客。",
    say: "有乘客按了紧急呼叫！快按中间黄色的广播按钮！", ok: "广播好了，乘客安心了！", fail: "没来得及广播，乘客有点害怕……" },
  horn: { icon: "🔔", btn: "鸣笛", zh: "前方轨道旁有施工人员！请司机鸣笛提醒他们注意。",
    say: "前面有工人叔叔！快按中间黄色的鸣笛按钮！", ok: "鸣笛了，施工人员已经让开！", fail: "没有鸣笛，施工人员吓了一跳……" },
  work: { icon: "🚧", zh: "前方施工区，临时限速 40 公里/小时，请减速慢行。",
    say: "前面在施工，要慢慢开，速度不要超过四十！", ok: "施工区安全通过！", fail: "施工区超速了！" },
};
// 真实站间距动辄一两公里，区间中段自动 3 倍速快进（速度表照常显示真实车速），离站台 450 米恢复正常
const FF_SPEED = 3;
const FF_UNTIL = 450;

const CN_NUM = "零一二三四五六七八九";
const EN_NUM = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const lineNum = (name) => parseInt(name, 10);
// 换乘线路：中文 “轨道交通二号线、五号线”，英文 “Line Two and Line Five”
const cnTransfer = (list) => "轨道交通" + list.map((n) => CN_NUM[lineNum(n)] + "号线").join("、");
const enTransfer = (list) =>
  list.map((n) => "Line " + EN_NUM[lineNum(n)]).join(", ").replace(/, ([^,]*)$/, " and $1");

// 英文播报是一串片段：普通字符串用英文语音读，{ zh: 站名 } 用中文语音读（站名念中文）
const stn = (name) => ({ zh: name });
const enTransferPart = (tr) => (tr.length ? [` You can transfer to ${enTransfer(tr)}.`] : []);

// 合肥地铁式播报词
function departCall(to, terminal, tr, courtesy) {
  const last = to === terminal;
  const zh = `本次列车开往${terminal}方向，下一站${last ? "，终点站" : ""}${to}` +
    `${tr.length ? "，可换乘" + cnTransfer(tr) : ""}。请刚上车的乘客往车厢中部走，要下车的乘客请提前做好准备。` +
    (courtesy ? "各位尊敬的乘客，使用电子设备时请勿外放声音，感谢您的配合。" : "");
  const en = [
    "This train is bound for", stn(terminal),
    last ? ". The next stop is the terminal station," : ". The next stop is", stn(to), ".",
    ...enTransferPart(tr), " Please get ready for your arrival.",
  ];
  return { zh, en };
}
function arriveCall(to, terminal, tr, door) {
  const side = door === "左" ? "left" : "right";
  if (to === terminal) {
    return {
      zh: `终点站${to}到了，请带好随身物品，从列车前进方向${door}侧车门下车。` +
        `${tr.length ? "本站可换乘" + cnTransfer(tr) + "。" : ""}感谢您乘坐合肥轨道交通。`,
      en: [
        "We are arriving at the terminal station,", stn(to),
        `. Please take all your belongings and leave from the ${side} side.`, ...enTransferPart(tr),
      ],
    };
  }
  return {
    zh: `${to}到了，请从列车前进方向${door}侧车门下车。${tr.length ? "本站可换乘" + cnTransfer(tr) + "。" : ""}`,
    en: ["We are arriving at", stn(to), `. Please leave from the ${side} side.`, ...enTransferPart(tr)],
  };
}
// 屏幕上显示的英文：站名直接写中文
const enText = (parts) =>
  (parts || []).map((x) => (typeof x === "string" ? x : " " + x.zh)).join("").trim();

function parTime(len, vm) {
  return (len / vm + vm / 4 + vm / 6.4) * 1.15 + 3;
}

// 驾驶画面：负责一位小司机的一整趟行程
export default function Drive({ line, trip, player, onFinish, onQuit, muted, onMute, skin }) {
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
  const [banner, setBanner] = useState({ zh: "", en: null });
  const [doorMsg, setDoorMsg] = useState("");
  const [canClose, setCanClose] = useState(false);
  const [lateRun, setLateRun] = useState(false);
  const [evt, setEvt] = useState(null); // 正在进行、需要按按钮的小事件
  const lastR = results.current[results.current.length - 1];
  const onboard = lastR ? lastR.onboard : START_PASSENGERS;
  const combo = lastR ? lastR.combo : 0;
  const preciseTol = lv.tol * 0.4; // 精准停车范围（米）

  const seg = trip.segs[segIdx];

  function announce({ zh, en }) {
    setBanner({ zh, en: enText(en) });
    speak(zh, en);
  }
  // 语音提示：同一区间里每种提示只说一次
  function voice(key, text, opts) {
    const s = g.current;
    if (!s || s.said.has(key)) return;
    s.said.add(key);
    say(text, opts);
  }

  // 每到一个新区间：重置列车，播报下一站
  useEffect(() => {
    g.current = {
      phase: "ready", x: 0, v: 0, t: 0, dwell: 0, over: 0, door: 0,
      warnAt: 0, hudAt: 0, tip: "", load: onboard, boarded: false, called: false, ff: false, boardAnim: 0,
      pending: null, late: null, lateWill: false,
      ev: null, evStarted: false, evResult: null, work: null, alert: null, said: new Set(), readyAt: performance.now(),
    };
    setEvt(null);
    setPhase("ready");
    setCard(null);
    setDoorMsg("");
    setCanClose(false);
    setLateRun(false);
    sfx.doorClose();
    announce(departCall(seg.to, trip.terminal, transfersAt(seg.to, line.id), segIdx % 2 === 1));
    if (segIdx === 0) voice("go", "小司机，按住右边绿色的加速按钮，出发啦！");
  }, [segIdx]);

  // 第 1 步：列车停稳（或冲过站）——先算停车准度
  function arrive(missed) {
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
    const total = missed ? 0 : Math.max(0, precision + bonus - penalty);
    const kind = missed ? "missed" : abs <= preciseTol ? "precise" : "rough";
    if (s.ev && !s.evResult) s.evResult = "fail";
    s.pending = {
      station: seg.to, err, precision, bonus, penalty, total, stars, title, missed, time: s.t, kind,
      wrongDoor: false, lateBonus: false, event: s.evResult, eventType: seg.event && seg.event.type,
    };
    if (missed) {
      sfx.miss();
      announce({ zh: `哎呀，列车冲过了${seg.to}站！下次记得早一点刹车哦。`, en: null });
      finalize();
      return;
    }
    sfx.chime();
    if (!s.called) announce(arriveCall(seg.to, trip.terminal, transfersAt(seg.to, line.id), seg.door));
    s.phase = "stopped";
    setPhase("stopped");
    setDoorMsg("");
    // 新手线直接告诉开哪边；进阶、高手要自己听广播
    voice("stopped", lv.hint && line.level === 1
      ? `停稳啦！请按${seg.door}边的开门按钮。`
      : "停稳啦！刚才广播说从哪边下车？按那边的开门按钮。");
  }

  // 第 2 步：开门——听广播，开对哪一边
  function openDoor(side) {
    const s = g.current;
    if (s.phase !== "stopped") return;
    if (side !== seg.door) {
      s.pending.wrongDoor = true;
      sfx.miss();
      setDoorMsg(`开错啦！这边没有站台。再听听广播：从${seg.door}侧车门下车`);
      say(`开错啦！这边没有站台，要开${seg.door}边的门。`, { interrupt: true });
      return;
    }
    sfx.good();
    s.phase = "open";
    s.boarded = true;
    s.lateWill = seg.late;
    setPhase("open");
    setDoorMsg(s.pending.wrongDoor ? `开对了，不过刚才开错一次，乘客等急了（少上 ${WRONG_DOOR_PENALTY} 人）` : "开对了！乘客正在上下车…");
    say("开对啦！乘客正在上下车。", { interrupt: true });
  }

  // 区间小事件：按按钮处理
  function handleEvent() {
    const s = g.current;
    if (!s.ev || s.evResult) return;
    s.evResult = "ok";
    s.ev = null;
    setEvt(null);
    sfx.good();
    if (seg.event.type === "horn") sfx.warn();
    s.alert = { text: EVENTS[seg.event.type].ok, kind: "ok", until: performance.now() + 2500 };
    say(EVENTS[seg.event.type].ok, { interrupt: true });
  }

  // 第 3 步：关门——乘客上完再关；有人跑过来可以等一等
  function closeDoor() {
    const s = g.current;
    if (s.phase !== "open" || s.boardAnim < 1) return;
    if (s.late && !s.late.inside) {
      s.pending.lateBonus = false;
      setDoorMsg("哎呀，那位乘客没赶上……");
      say("哎呀，那位乘客没赶上。", { interrupt: true });
      s.late = null;
    } else {
      s.pending.lateBonus = !!(s.late && s.late.inside);
    }
    sfx.doorClose();
    s.phase = "closing";
    setPhase("closing");
    setCanClose(false);
    setLateRun(false);
  }

  // 第 4 步：结算这一站
  function finalize() {
    const s = g.current;
    const p = s.pending;
    const before = onboard;
    const out = stopOutcome(before, combo, p);
    const r = { ...p, before, ...out, coins: out.board };
    s.load = r.onboard;
    results.current.push(r);
    s.phase = "done";
    setPhase("done");
    setCard(r);
    if (!p.missed) setTimeout(() => (p.stars === 3 ? sfx.perfect() : sfx.good()), 200);
    // 读出这一站的结果
    const parts = [p.missed ? "冲过站啦" : p.title.replace(/！/g, ""), `上来${out.board}位乘客`];
    if (out.mult > 1) parts.push(`连击${out.combo}`);
    parts.push(segIdx === trip.segs.length - 1 ? "按绿色按钮看成绩" : "按绿色按钮发车");
    say(parts.join("，") + "。");
  }

  function next() {
    if (g.current.phase !== "done") return;
    if (segIdx === trip.segs.length - 1) onFinish(results.current);
    else setSegIdx(segIdx + 1);
  }
  const act = useRef({});
  act.current = { arrive, openDoor, closeDoor, finalize, next, handleEvent };

  // 键盘操作
  useEffect(() => {
    const set = (e, down) => {
      const k = e.key;
      const ph = g.current && g.current.phase;
      // 停稳后：← / Q 开左门，→ / E 开右门，回车关门 / 发车
      if (down && ph === "stopped" && (k === "ArrowLeft" || k === "q" || k === "Q")) act.current.openDoor("左");
      else if (down && ph === "stopped" && (k === "ArrowRight" || k === "e" || k === "E")) act.current.openDoor("右");
      else if (down && k === "Enter") { if (ph === "open") act.current.closeDoor(); else act.current.next(); }
      else if (down && (k === "b" || k === "B" || k === "h" || k === "H")) act.current.handleEvent();
      else if (k === "ArrowUp" || k === "ArrowRight" || k === "w" || k === "W") input.current.acc = down;
      else if (k === "ArrowDown" || k === "ArrowLeft" || k === "s" || k === "S" || k === " ") input.current.brk = down;
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
    // 结果面板出现/收起时画面高度会变，跟着重新调整画布
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(wrapRef.current);

    const step = (dt, now) => {
      const s = g.current;
      const inp = input.current;
      if (s.phase === "ready" && inp.acc) { s.phase = "run"; setPhase("run"); }
      if (s.phase === "ready" && now - s.readyAt > 9000) voice("nudge", "按住右边绿色的加速按钮，列车就出发啦！");
      // 第一站快到时，教一下怎么看对准条
      if (s.phase === "run" && segIdx === 0 && seg.len - s.x < 60) voice("aim", "看上面的长条，让小圆点停在绿色里面，就是停准啦！");
      if (s.phase === "run" || s.phase === "missed") {
        const realDt = dt;
        const lim0 = seg.limit;
        const zone = s.work;
        // 区间小事件：开到事件位置就触发
        if (s.phase === "run" && seg.event && !s.evStarted && s.x >= seg.event.at) {
          s.evStarted = true;
          const E = EVENTS[seg.event.type];
          setBanner({ zh: E.zh, en: null });
          sfx.warn();
          say(E.say, { interrupt: true });
          if (seg.event.type === "work") {
            s.work = seg.event.zone;
            s.evResult = "ok";
          } else {
            s.ev = { type: seg.event.type, left: EVENT_TIME };
            setEvt({ type: seg.event.type });
          }
        }
        if (s.ev) {
          s.ev.left -= realDt;
          if (s.ev.left <= 0) {
            s.evResult = "fail";
            s.ev = null;
            setEvt(null);
            sfx.miss();
            s.alert = { text: EVENTS[seg.event.type].fail, kind: "bad", until: now + 2500 };
            say(EVENTS[seg.event.type].fail, { interrupt: true });
          }
        }
        // 快进：限速区、施工区、小事件附近都不快进
        s.ff = s.phase === "run" && seg.len - s.x > FF_UNTIL &&
          !(lim0 && s.x > lim0.from - 250 && s.x < lim0.to) &&
          !s.ev &&
          !(zone && s.x > zone.from - 250 && s.x < zone.to) &&
          !(seg.event && !s.evStarted && seg.event.at - s.x < 250);
        if (s.ff) dt *= FF_SPEED;
        let a = 0;
        if (s.phase === "missed" || inp.brk) a = -BRK;
        else if (inp.acc) a = ACC * (1 - Math.pow(s.v / vm, 3) * 0.7);
        else a = -DRAG;
        s.v = Math.max(0, Math.min(vm, s.v + a * dt));
        s.x += s.v * dt;
        if (s.phase === "run") s.t += dt;
        const remain = seg.len - s.x;
        // 施工区限速 40
        if (s.work && s.phase === "run" && s.x > s.work.from && s.x < s.work.to && s.v * 3.6 > s.work.kmh + 2) {
          if (s.evResult === "ok") {
            s.evResult = "fail";
            s.alert = { text: EVENTS.work.fail, kind: "bad", until: now + 2500 };
            say("太快啦！施工区要慢一点！", { interrupt: true });
          }
          s.over += dt;
          if (now > s.warnAt) { sfx.warn(); s.warnAt = now + 400; }
        }

        if (s.phase === "run") {
          // 限速区
          const lim = seg.limit;
          if (lim && s.x > lim.from && s.x < lim.to && s.v * 3.6 > lim.kmh + 2) {
            s.over += dt;
            voice("over", "超速啦！看到限速牌要慢一点！", { interrupt: true });
            if (now > s.warnAt) { sfx.warn(); s.warnAt = now + 400; }
          }
          // 列车进站时就播报到站（站台长约 120 米）
          if (!s.called && remain < 150) {
            s.called = true;
            announce(arriveCall(seg.to, trip.terminal, transfersAt(seg.to, line.id), seg.door));
          }
          if (remain < -lv.tol) { s.phase = "missed"; setPhase("missed"); }
          else if (s.v === 0) {
            if (Math.abs(remain) <= lv.tol) {
              s.dwell += dt;
              s.tip = "停稳啦，正在开门…";
              if (s.dwell > 0.7) act.current.arrive(false);
            } else {
              s.dwell = 0; s.tip = "还没到停车点，继续往前开！";
              if (remain > 25) voice("short", "还没到站呢，再往前开一点！");
            }
          } else { s.dwell = 0; s.tip = ""; }
        } else if (s.v === 0) act.current.arrive(true);
      }
      // 开关门动画、乘客上车、最后一刻跑来的乘客
      if (s.phase === "open") {
        s.door = Math.min(1, s.door + dt * 1.5);
        if (s.door > 0.6) s.boardAnim = Math.min(1, s.boardAnim + dt * 0.7);
        if (s.boardAnim >= 1 && s.lateWill && !s.late) {
          s.late = { t: 0, inside: false };
          setLateRun(true);
          setDoorMsg("有位乘客正往这边跑！要不要等等他？");
          say("有乘客跑过来了！先别关门，等一等他！", { interrupt: true });
        }
        if (s.late) {
          s.late.t += dt * 0.45;
          if (s.late.t >= 1 && !s.late.inside) {
            s.late.inside = true;
            setLateRun(false);
            setDoorMsg(`等到了！又上来 ${LATE_BONUS} 位乘客，可以关门啦`);
            say("他上车啦！现在可以按关门了。");
          }
        }
        if (s.boardAnim >= 1 && !s.canClose) {
          s.canClose = true;
          setCanClose(true);
          if (!s.lateWill) say("乘客上完啦，按橙色的关门按钮。");
        }
      } else if (s.phase === "closing") {
        s.door = Math.max(0, s.door - dt * 1.4);
        if (s.late && s.late.inside) s.late.t += dt * 0.45;
        if (s.door === 0) act.current.finalize();
      }

      if (now > s.hudAt) {
        s.hudAt = now + 70;
        const toStation = seg.len - s.x;
        const remain = toStation;
        const stopD = (s.v * s.v) / (2 * BRK);
        let hint = "go";
        if (remain < stopD + s.v * 0.5 + 3) hint = "brake";
        else if (remain < stopD * 1.5 + 45) hint = "slow";
        const lim = s.work && s.x < s.work.to ? s.work : seg.limit;
        let limit = null, over = false;
        if (lim && s.x > lim.from - 160 && s.x < lim.to) {
          limit = lim.kmh;
          over = s.v * 3.6 > lim.kmh + 2;
          if (over && s.x < lim.from && hint === "go") hint = "slow";
        }
        // 状态提示：小事件 > 施工区
        let alert = null;
        if (s.alert && now < s.alert.until) alert = s.alert;
        else if (s.ev) alert = { text: `${EVENTS[s.ev.type].icon} ${s.ev.type === "intercom" ? "乘客紧急呼叫" : "前方有施工人员"}！快按【${EVENTS[s.ev.type].btn}】（${Math.ceil(s.ev.left)} 秒）`, kind: "event" };
        else if (s.work && s.x > s.work.from - 200 && s.x < s.work.to) alert = { text: "🚧 施工区，限速 40", kind: "warn" };
        setHud({
          kmh: Math.round(s.v * 3.6), dist: Math.max(0, Math.round(toStation)), hint,
          tip: s.phase === "ready" ? "按住【加速】发车！" : s.tip, limit, ff: s.ff,
          over: over && s.x > lim.from,
          off: Math.abs(toStation) < 60 ? -toStation : null,
          alert, evLeft: s.ev ? s.ev.left : 0,
        });
      }
    };

    const draw = () => {
      const s = g.current;
      drawScene(c, W, H, s, { seg, line, terminal: trip.terminal, doorsOpen: s.door, skin, mirror: seg.door === "左" });
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
      if (ro) ro.disconnect();
    };
  }, [segIdx]);

  const hold = (key) => ({
    onPointerDown: (e) => { e.preventDefault(); sfx.unlock(); input.current[key] = true; },
    onPointerUp: () => { input.current[key] = false; },
    onPointerLeave: () => { input.current[key] = false; },
    onPointerCancel: () => { input.current[key] = false; },
    onContextMenu: (e) => e.preventDefault(),
  });

  const last = segIdx === trip.segs.length - 1;
  const lamp = phase === "run" ? hud.hint : phase === "ready" ? "go" : null;
  const lampText = { go: "加速前进", slow: "准备减速", brake: "快刹车！" }[lamp] || "停稳了";

  const prog = Math.max(0, Math.min(100, 100 - (hud.dist / seg.len) * 100));
  const doorPhase = phase === "stopped" || phase === "open" || phase === "closing";
  const status = phase === "missed" ? "冲过站啦！紧急刹车中…"
    : phase === "stopped" ? (doorMsg || "🚪 停稳了！听广播：该开哪一边的车门？")
    : phase === "open" || phase === "closing" ? doorMsg
    : hud.alert ? hud.alert.text
    : hud.tip;

  return (
    <div className="drive" style={{ "--line": line.color }}>
      <div className="hud-top">
        <button className="round-btn" onClick={onQuit} aria-label="退出">✕</button>
        <button className="round-btn" onClick={onMute} aria-label={muted ? "打开声音" : "关闭声音"}>{muted ? "🔇" : "🔊"}</button>
        <div className="line-chip">
          <span className="line-num">{line.id}</span>
          <span className="line-dir">开往<br /><b>{trip.terminal}</b></span>
        </div>
        <div className="next-stop">
          <small>下一站</small>
          <b>{seg.to}</b>
        </div>
        <div className="pax-chip" title="车上乘客">
          <span className="pax-icon">👥</span>
          <b>{onboard}</b><small>人</small>
        </div>
      </div>

      <div className="route">
        <div className="route-line" />
        {trip.names.map((n, i) => (
          <div key={i} className={"stop" + (i <= segIdx ? " done" : "") + (i === segIdx + 1 ? " cur" : "")}>
            <span className="stop-dot">{i === segIdx + 1 ? "🚇" : ""}</span>
            <span className="stop-name">{n}</span>
          </div>
        ))}
      </div>

      <div className="pis">
        <span className="pis-icon">📢</span>
        <div className="pis-text">
          <p>{banner.zh}</p>
          {banner.en && <p className="en">{banner.en}</p>}
        </div>
      </div>

      {!card && (
        <div className="dash">
          <div className={"gauge" + (hud.over ? " over" : "")}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <path d={arcPath(0, 1)} className="g-track" />
              {hud.limit && <path d={arcPath(hud.limit / lv.vmax, 1)} className="g-limit" />}
              <path d={arcPath(0, Math.min(1, hud.kmh / lv.vmax))} className="g-fill" />
              {[0, 20, 40, 60, 80].map((v) => {
                const [x, y] = polar(v / lv.vmax, 40);
                return <text key={v} x={x} y={y} className="g-tick">{v}</text>;
              })}
              <line x1="60" y1="60" {...needle(hud.kmh / lv.vmax)} className="g-needle" />
              <circle cx="60" cy="60" r="6" className="g-hub" />
            </svg>
            <div className="g-num"><b>{hud.kmh}</b><small>km/h</small></div>
          </div>

          {lv.hint ? (
            <div className="signal" aria-label={lampText}>
              <div className="signal-box">
                <i className={"l green" + (lamp === "go" ? " on" : "")} />
                <i className={"l yellow" + (lamp === "slow" ? " on" : "")} />
                <i className={"l red" + (lamp === "brake" ? " on" : "")} />
              </div>
              <span className={"signal-text " + (lamp || "")}>{lampText}</span>
            </div>
          ) : (
            <div className="signal off"><span className="signal-text">高手模式<br />没有提示灯</span></div>
          )}

          <div className="panel-mid">
            {status ? (
              <div className={"status" + (phase === "missed" || doorMsg.startsWith("开错") || doorMsg.startsWith("哎呀") ? " bad" : "") + (doorPhase ? " door" : "") + (!doorPhase && hud.alert ? " alert-" + hud.alert.kind : "")}>{status}</div>
            ) : hud.off !== null ? (
              <div className="status ok">停在<b>亮绿区</b> = 精准停车，多上乘客！</div>
            ) : (
              <div className="status">还有 <b>{hud.dist}</b> 米到 <b>{seg.to}</b></div>
            )}
            {hud.off !== null ? (
              <div className="aim-bar">
                <div className="zone" style={{ width: `${(lv.tol / 60) * 100}%` }} />
                <div className="zone precise" style={{ width: `${(preciseTol / 60) * 100}%` }} />
                <div className="center" />
                <div className="ptr" style={{ left: `${50 + Math.max(-1, Math.min(1, hud.off / 60)) * 50}%` }} />
              </div>
            ) : (
              <div className="ap-row">
                <span className="ap-from">{seg.from}</span>
                <div className="ap-bar">
                  <div className="ap-fill" style={{ width: `${prog}%` }} />
                  <span className="ap-train" style={{ left: `${prog}%` }}>🚇</span>
                </div>
                <span className="ap-to">{seg.to}</span>
              </div>
            )}
          </div>

          {(hud.limit || (hud.ff && phase === "run") || combo > 0) && (
            <div className="badges">
              {combo > 0 && <div className="combo">🔥 连击 {combo}</div>}
              {hud.limit && <div className={"limit" + (hud.over ? " over" : "")}><b>{hud.limit}</b></div>}
              {hud.ff && phase === "run" && <div className="ff">⏩ 快进</div>}
            </div>
          )}
        </div>
      )}

      <div className="scene" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>

      {card ? (
        <div className={"sheet " + card.kind}>
          <div className="sh-head">
            <h2 className={card.missed ? "bad" : ""}>{card.title}</h2>
            <div className="stars">{"⭐".repeat(card.stars)}{"☆".repeat(3 - card.stars)}</div>
            {!card.missed && (
              <p className="err">
                {Math.abs(card.err) <= 0.5 ? "分毫不差！" : card.err < 0 ? "离停车点还差 " : "超过停车点 "}
                {Math.abs(card.err) > 0.5 && <b>{Math.abs(card.err).toFixed(1)} 米</b>}
              </p>
            )}
          </div>
          <div className="sh-pax">
            <div className="pax-tag">
              {card.kind === "precise" ? "🎯 精准停车" : card.kind === "rough" ? "😅 没停准" : "😡 乘客生气了"}
            </div>
            <div className="pax-row">
              <span>⬇️ 下车 <b>{card.alight}</b></span>
              <span>⬆️ 上车 <b>{card.board}</b></span>
            </div>
            {(card.mult > 1 || card.wrongDoor || card.lateBonus || card.event) && (
              <div className="pax-extra">
                {card.mult > 1 && <span className="hot">🔥 连击 {card.combo}：上车 ×{card.mult}</span>}
                {card.wrongDoor && <span className="bad">🚪 开错门 −{WRONG_DOOR_PENALTY}</span>}
                {card.lateBonus && <span className="good">🏃 等到迟到乘客 +{LATE_BONUS}</span>}
                {card.event === "ok" && <span className="good">{EVENTS[card.eventType].icon} 事件处理好 +{EVENT_BONUS}</span>}
                {card.event === "fail" && <span className="bad">{EVENTS[card.eventType].icon} 事件没处理好 −{EVENT_PENALTY}</span>}
              </div>
            )}
            <div className="pax-now">
              车上 {card.before} → <b>{card.onboard}</b> 人
              <em className={card.onboard >= card.before ? "up" : "down"}>
                {card.onboard >= card.before ? "+" : ""}{card.onboard - card.before}
              </em>
            </div>
          </div>
          <div className="sh-score">
            <span>🎯 停车准度 <b>+{card.precision}</b></span>
            <span>⏱ 准点 <b>+{card.bonus}</b></span>
            {card.penalty > 0 && <span>⚠️ 超速 <b>-{card.penalty}</b></span>}
            <span className="sum">驾驶分 <b>{card.total}</b></span>
            {card.coins > 0 && <span className="coins">🪙 金币 <b>+{card.coins}</b></span>}
          </div>
          <button className="big go sh-btn" onClick={next}>{last ? "看成绩 🏁" : "发车 ▶"}</button>
        </div>
      ) : phase === "stopped" ? (
        <div className="console doors">
          <button className="door-btn" onClick={() => openDoor("左")}>
            <span className="door-arrow">◀</span><span>开左门</span><small>列车前进方向的左边</small>
          </button>
          <button className="door-btn" onClick={() => openDoor("右")}>
            <span>开右门</span><span className="door-arrow">▶</span><small>列车前进方向的右边</small>
          </button>
        </div>
      ) : phase === "open" || phase === "closing" ? (
        <div className="console doors">
          <button className={"close-btn" + (lateRun ? " wait" : "")} disabled={!canClose || phase === "closing"} onClick={closeDoor}>
            {phase === "closing" ? "关门中…" : !canClose ? "乘客上下车中…" : lateRun ? "⏳ 有人跑来了…（现在关门他就赶不上）" : "🚪 关门"}
          </button>
        </div>
      ) : (
        <div className="console">
          <button className="pedal brake" {...hold("brk")}>
            <span className="pedal-icon">✋</span>
            <span className="pedal-text">刹车</span>
            <small>按住减速</small>
          </button>
          <div className="console-mid">
            {evt ? (
              <button className="event-btn" onClick={handleEvent}>
                <span>{EVENTS[evt.type].icon}</span>{EVENTS[evt.type].btn}
                <small>{Math.ceil(hud.evLeft || 0)} 秒</small>
              </button>
            ) : (
              <>
                <span className="driver">🧑‍✈️ {player}</span>
                <span className="keys">键盘 ↑ 加速 · ↓ 刹车 · B 广播/鸣笛</span>
              </>
            )}
          </div>
          <button className="pedal go" {...hold("acc")}>
            <span className="pedal-icon">🚀</span>
            <span className="pedal-text">加速</span>
            <small>按住前进</small>
          </button>
        </div>
      )}
    </div>
  );
}

// 速度表：0–1 对应 225°（左下）到 -45°（右下），顺时针扫过 270°
function polar(f, r) {
  const a = ((225 - 270 * f) * Math.PI) / 180;
  return [60 + r * Math.cos(a), 60 - r * Math.sin(a)];
}
function arcPath(f0, f1, r = 50) {
  const [x0, y0] = polar(f0, r), [x1, y1] = polar(f1, r);
  const large = (f1 - f0) * 270 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
function needle(f) {
  const [x, y] = polar(Math.min(1, f), 44);
  return { x2: x, y2: y };
}
