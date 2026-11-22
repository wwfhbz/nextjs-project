import Head from "next/head";
import { useEffect, useState } from "react";
import Drive, { RULES, START_PASSENGERS } from "../components/Drive";
import { LINES, LEVELS, buildTrip } from "../lib/lines";
import { setMuted, sfx } from "../lib/sound";
import { ACHIEVEMENTS, dailyPlan, loadProgress, recordTrip, todayKey } from "../lib/progress";
import { makePoster } from "../lib/poster";

const LENGTHS = [
  { stops: 3, label: "短途 3 站" },
  { stops: 5, label: "标准 5 站" },
  { stops: 8, label: "长途 8 站" },
];
const KEY = "metro-rush-board-v2";

function loadBoard() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function saveScore(id, entry) {
  const b = loadBoard();
  b[id] = [...(b[id] || []), entry]
    .sort((x, y) => y.passengers - x.passengers || y.score - x.score)
    .slice(0, 10);
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {}
  return b;
}
const best = RULES.precise.board - RULES.precise.alight; // 每站最多净增人数
function rankTitle(rs) {
  const ratio = (pax(rs) - START_PASSENGERS) / (best * rs.length);
  if (ratio >= 0.9) return "👑 王牌司机";
  if (ratio >= 0.6) return "🥇 金牌司机";
  if (ratio >= 0.3) return "🚇 正式司机";
  return "🌱 实习司机";
}
const sum = (rs) => rs.reduce((s, r) => s + r.total, 0);
const pax = (rs) => rs[rs.length - 1].onboard;
// 先比车上人数，人数一样再比驾驶分
const beats = (a, b) => pax(a) - pax(b) || sum(a) - sum(b);

export default function Home() {
  const [screen, setScreen] = useState("home");
  const [line, setLine] = useState(null);
  const [pk, setPk] = useState(false);
  const [stops, setStops] = useState(3);
  const [names, setNames] = useState(["小司机", "小司机2号"]);
  const [trip, setTrip] = useState(null);
  const [turn, setTurn] = useState(0);
  const [all, setAll] = useState([]);
  const [board, setBoard] = useState({});
  const [mute, setMute] = useState(false);
  const [daily, setDaily] = useState(null); // 今日挑战计划，普通模式为 null
  const [progress, setProgress] = useState(null);
  const [fresh, setFresh] = useState([]); // 本局新解锁的成就
  const [poster, setPoster] = useState(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const [today, setToday] = useState(null);

  useEffect(() => {
    setBoard(loadBoard());
    setProgress(loadProgress());
    setToday(dailyPlan(todayKey()));
  }, []);
  useEffect(() => setMuted(mute), [mute]);

  const boardId = daily ? `daily-${daily.key}` : line ? `${line.id}-${stops}` : "";
  const players = pk ? names : names.slice(0, 1);

  function start() {
    sfx.unlock();
    if (daily) {
      setTrip(buildTrip(daily.line, daily.startIndex, daily.dir, daily.stops));
    } else {
      const n = line.stations.length;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const first = Math.floor(Math.random() * (n - stops));
      const startIndex = dir > 0 ? first : first + stops;
      setTrip(buildTrip(line, startIndex, dir, stops));
    }
    setFresh([]);
    setAll([]);
    setTurn(0);
    setScreen("play");
  }

  function finish(results) {
    const list = [...all, results];
    setAll(list);
    const got = recordTrip(line, trip, results, daily && daily.key, players[turn] || "小司机");
    if (got.length) setFresh((f) => [...f, ...got]);
    setProgress(loadProgress());
    setBoard(saveScore(boardId, {
      name: players[turn] || "小司机", passengers: pax(results), score: sum(results),
      date: new Date().toLocaleDateString(),
    }));
    if (turn + 1 < players.length) setScreen("handover");
    else { sfx.win(); setScreen("result"); }
  }

  const top = (board[boardId] || []).slice(0, 5);

  function openDaily() {
    sfx.unlock();
    setDaily(today);
    setLine(today.line);
    setStops(today.stops);
    setScreen("setup");
  }
  function openLine(l) {
    sfx.unlock();
    setDaily(null);
    setLine(l);
    setScreen("setup");
  }
  async function share(p) {
    setPosterBusy(true);
    try {
      const rs = all[p];
      setPoster(await makePoster({ line, trip, name: players[p] || "小司机", results: rs, title: rankTitle(rs), dailyKey: daily && daily.key }));
    } finally {
      setPosterBusy(false);
    }
  }
  const myDaily = progress && today && progress.daily[today.key];
  const visitedCount = progress ? Object.values(progress.visited).reduce((n, v) => n + v.length, 0) : 0;
  const totalStations = LINES.reduce((n, l) => n + l.stations.length, 0);

  return (
    <div className="app">
      <Head>
        <title>地铁冲冲冲！开合肥地铁小游戏</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {screen !== "play" && <button className="mute" onClick={() => setMute(!mute)} aria-label={mute ? "打开声音" : "关闭声音"}>{mute ? "🔇" : "🔊"}</button>}

      {screen === "home" && (
        <div className="page home">
          <header className="hero">
            <TrainArt />
            <h1 className="logo">地铁冲冲冲！</h1>
            <p className="sub">当一回合肥地铁小司机：精准停车接乘客，看谁的车上人最多！</p>
          </header>

          {today && (
            <div className="quick">
              <button className="daily-card" style={{ "--line": today.line.color }} onClick={openDaily}>
                <span className="dc-tag">📅 今日挑战</span>
                <b>{today.line.name}</b>
                <span className="dc-route">
                  {buildTrip(today.line, today.startIndex, today.dir, today.stops).names[0]} →{" "}
                  {buildTrip(today.line, today.startIndex, today.dir, today.stops).names[today.stops]} · {today.stops} 站
                </span>
                <span className="dc-best">{myDaily ? `今天最好：${myDaily.passengers} 人` : "每天一题，和同学比比谁接的人多！"}</span>
              </button>
              <button className="album-card" onClick={() => setScreen("album")}>
                <span className="dc-tag">📖 集站手册</span>
                <b>{visitedCount} / {totalStations}</b>
                <span className="dc-route">已点亮的车站</span>
                <span className="dc-best">🏅 成就 {progress ? progress.unlocked.length : 0} / {ACHIEVEMENTS.length}</span>
              </button>
            </div>
          )}

          <h2 className="step-title"><span className="step-no">1</span>选一条线路</h2>
          <div className="lines">
            {LINES.map((l) => {
              const km = l.dist.reduce((x, y) => x + y, 0) / 1000;
              return (
                <button key={l.id} className="line-card" style={{ "--line": l.color }}
                  onClick={() => openLine(l)}>
                  <span className="lc-num">{l.id}</span>
                  <span className="lc-body">
                    <b>{l.name}</b>
                    <span className="lc-ends">{l.stations[0]} ⇄ {l.stations[l.stations.length - 1]}</span>
                    <span className="lc-meta">
                      <em className={"lv lv" + l.level}>{LEVELS[l.level].stars} {LEVELS[l.level].label}</em>
                      {l.stations.length} 站 · {km.toFixed(1)} 公里
                    </span>
                  </span>
                  <span className="lc-go">▶</span>
                </button>
              );
            })}
          </div>

          <h2 className="step-title"><span className="step-no">2</span>怎么开地铁？</h2>
          <div className="how-cards">
            <div className="how-card"><span className="hc-icon go">🚀</span><b>按住加速</b><span>列车出发，松开会慢慢滑行</span></div>
            <div className="how-card"><span className="hc-icon brake">✋</span><b>按住刹车</b><span>快到站时减速，看信号灯提示</span></div>
            <div className="how-card"><span className="hc-icon stop">停</span><b>对准停车牌</b><span>绿色箭头 ▼ 对准红色“停”牌</span></div>
            <div className="how-card"><span className="hc-icon limit">50</span><b>看到限速牌</b><span>要减到牌子上的速度以下</span></div>
          </div>

          <h2 className="step-title"><span className="step-no">3</span>接乘客，比人数</h2>
          <div className="rule-cards">
            <div className="rule precise"><b>🎯 精准停车</b><span>上车 {RULES.precise.board} 人</span><span>下车 {RULES.precise.alight} 人</span></div>
            <div className="rule rough"><b>😅 没停准</b><span>上车 {RULES.rough.board} 人</span><span>下车 {RULES.rough.alight} 人</span></div>
            <div className="rule missed"><b>😡 冲过站</b><span>没人上车</span><span>下车 {RULES.missed.alight} 人</span></div>
          </div>
          <p className="note center-note">出发时车上有 {START_PASSENGERS} 人。跑完全程，<b>车上乘客最多</b>的司机获胜！</p>
        </div>
      )}

      {screen === "setup" && line && (
        <div className="page setup" style={{ "--line": line.color }}>
          <button className="back-btn" onClick={() => setScreen("home")}>← 换条线路</button>
          <div className="setup-head">
            <span className="lc-num xl">{line.id}</span>
            <div>
              <h1>{line.name}</h1>
              <p>{line.stations[0]} ⇄ {line.stations[line.stations.length - 1]}</p>
              <p className="lv-line">
                <em className={"lv lv" + line.level}>{LEVELS[line.level].stars} {LEVELS[line.level].label}</em>
                停车误差 ±{LEVELS[line.level].tol} 米
                {LEVELS[line.level].limit ? " · 有限速区" : ""}{LEVELS[line.level].hint ? " · 有信号灯提示" : " · 没有信号灯提示"}
              </p>
            </div>
          </div>

          <div className="panel">
            <h3>几个人玩？</h3>
            <div className="choice">
              <button className={!pk ? "on" : ""} onClick={() => setPk(false)}><span>🧑‍✈️</span>一个人挑战</button>
              <button className={pk ? "on" : ""} onClick={() => setPk(true)}><span>⚔️</span>两个人比赛</button>
            </div>
            {daily ? (
              <div className="daily-note">
                📅 今日挑战（{daily.key}）：
                <b>{buildTrip(daily.line, daily.startIndex, daily.dir, daily.stops).names.join(" → ")}</b>
                <span>今天所有人开的都是这一段，看谁接的乘客最多！</span>
              </div>
            ) : (
              <>
                <h3>开几站？</h3>
                <div className="choice">
                  {LENGTHS.map((o) => (
                    <button key={o.stops} className={stops === o.stops ? "on" : ""} onClick={() => setStops(o.stops)}>
                      <span>{o.stops === 3 ? "🚶" : o.stops === 5 ? "🚲" : "🚀"}</span>{o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <h3>司机叫什么名字？</h3>
            <div className="names">
              {players.map((n, i) => (
                <label key={i} className="name-field">
                  <span>{pk ? `司机 ${i + 1}` : "司机"}</span>
                  <input id={`driver-${i}`} value={n} maxLength={8} placeholder={`司机 ${i + 1}`}
                    onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
            </div>
            {pk && <p className="note">两位司机轮流开同一段路，最后车上乘客多的获胜！</p>}
            <button className="big go wide start-btn" onClick={start}>出发！🚇</button>
          </div>

          <div className="panel">
            <h3>🏆 {daily ? `今日挑战 ${daily.key}` : `${line.name} · ${stops} 站`} 本机排行榜</h3>
            {top.length === 0 ? <p className="note">还没有成绩，快来当第一名！</p> : (
              <ol className="board">
                {top.map((e, i) => <li key={i}><span className="medal">{["🥇", "🥈", "🥉"][i] || i + 1}</span><span>{e.name}</span><b>{e.passengers} 人</b></li>)}
              </ol>
            )}
          </div>
        </div>
      )}

      {screen === "play" && (
        <Drive key={turn} line={line} trip={trip} player={players[turn] || "小司机"}
          onFinish={finish} onQuit={() => setScreen("setup")} muted={mute} onMute={() => setMute(!mute)} />
      )}

      {screen === "handover" && (
        <div className="page center handover">
          <div className="big-emoji">🔁</div>
          <h1 className="logo small">{players[turn]} 跑完啦！车上有 {pax(all[turn])} 位乘客</h1>
          <p className="sub">把设备交给下一位司机：<b>{players[turn + 1]}</b></p>
          <button className="big go wide" onClick={() => { setTurn(turn + 1); setScreen("play"); }}>我准备好了！🚀</button>
        </div>
      )}

      {screen === "result" && (
        <div className="page result">
          <h1 className="logo small">🏁 行程结束</h1>
          {pk && (() => {
            const d = beats(all[0], all[1]);
            return <p className="winner">{d === 0 ? "🤝 平局！两位都很棒" : `🎉 ${d > 0 ? players[0] : players[1]} 获胜！`}</p>;
          })()}
          {fresh.length > 0 && (
            <div className="new-badges">
              <b>🎉 解锁新成就！</b>
              <div className="badge-row">
                {fresh.map((a) => <Badge key={a.id} a={a} on />)}
              </div>
            </div>
          )}
          <div className="results">
            {all.map((rs, p) => (
              <div className="panel" key={p}>
                <h3>{players[p]} <span className="title">{rankTitle(rs)}</span></h3>
                <div className="totalscore">{pax(rs)}<small> 位乘客</small></div>
                <p className="note">驾驶分 {sum(rs)} · 精准停车 {rs.filter((r) => r.kind === "precise").length}/{rs.length} 站</p>
                <button className="big share-btn" disabled={posterBusy} onClick={() => share(p)}>📸 生成分享海报</button>
                <table className="detail">
                  <tbody>
                    {rs.map((r, i) => (
                      <tr key={i}>
                        <td>{r.station}</td>
                        <td>{r.missed ? "冲过站" : `偏差 ${Math.abs(r.err).toFixed(1)} 米`}</td>
                        <td>⬆️{r.board} ⬇️{r.alight}</td>
                        <td><b>{r.onboard}</b> 人</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div className="panel">
            <h3>🏆 {daily ? `今日挑战 ${daily.key}` : `${line.name} · ${stops} 站`} 本机排行榜</h3>
            <ol className="board">
              {top.map((e, i) => <li key={i}><span className="medal">{["🥇", "🥈", "🥉"][i] || i + 1}</span><span>{e.name}</span><b>{e.passengers} 人</b></li>)}
            </ol>
          </div>
          <div className="row">
            <button className="big go" onClick={start}>再来一次 🔁</button>
            <button className="big alt" onClick={() => setScreen("home")}>回到首页 🏠</button>
          </div>
        </div>
      )}

      {screen === "album" && progress && (
        <div className="page album">
          <button className="back-btn" onClick={() => setScreen("home")}>← 回到首页</button>
          <h1 className="logo small">📖 集站手册</h1>
          <p className="sub">开过并停靠的车站会被点亮。集齐一条线，就能得到这条线的徽章！</p>
          <div className="panel">
            <h3>🏅 成就（{progress.unlocked.length} / {ACHIEVEMENTS.length}）</h3>
            <div className="badge-grid">
              {ACHIEVEMENTS.map((a) => <Badge key={a.id} a={a} on={progress.unlocked.includes(a.id)} />)}
            </div>
          </div>
          {LINES.map((l) => {
            const got = new Set(progress.visited[l.id] || []);
            return (
              <div className="panel" key={l.id} style={{ "--line": l.color }}>
                <h3 className="album-h">
                  <span className="lc-num sm">{l.id}</span>{l.name}
                  <span className="album-count">{got.size} / {l.stations.length}</span>
                </h3>
                <div className="album-bar"><i style={{ width: `${(got.size / l.stations.length) * 100}%` }} /></div>
                <div className="chips">
                  {l.stations.map((st) => <span key={st} className={"chip" + (got.has(st) ? " on" : "")}>{st}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {poster && (
        <div className="poster-mask" onClick={() => setPoster(null)}>
          <div className="poster-box" onClick={(e) => e.stopPropagation()}>
            <p className="poster-tip">📱 手机上<b>长按图片</b>保存，发到微信群或朋友圈</p>
            <img src={poster} alt="地铁冲冲冲成绩海报" />
            <div className="row">
              <a className="big go" href={poster} download="地铁冲冲冲-成绩海报.png">保存图片</a>
              <button className="big alt" onClick={() => setPoster(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 首页插画：合肥地铁 B 型车车头
function TrainArt() {
  return (
    <svg className="train-art" viewBox="0 0 320 120" aria-hidden="true">
      <defs>
        <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9d0da" />
        </linearGradient>
      </defs>
      <rect x="0" y="104" width="320" height="6" rx="3" fill="#7d8494" />
      <path d="M8 22 H232 C270 22 296 46 300 78 V98 H8 Z" fill="url(#steel)" stroke="#8f98a6" strokeWidth="2" />
      <path d="M238 30 C266 32 286 50 291 72 H238 Z" fill="#1b2638" />
      <rect x="8" y="42" width="210" height="26" fill="#22314a" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={20 + i * 44} y="34" width="20" height="62" fill="#d5dbe4" stroke="#8f98a6" />)}
      <rect x="8" y="78" width="292" height="8" fill="#e53935" />
      <rect x="8" y="36" width="230" height="3" fill="#e53935" />
      <rect x="244" y="24" width="40" height="8" rx="2" fill="#111" />
      <text x="264" y="30.5" fontSize="6.5" fill="#ffb300" textAnchor="middle" fontWeight="bold">1号线 九联圩</text>
      <circle cx="292" cy="90" r="3.5" fill="#fffde7" />
      {[40, 70, 160, 190].map((x) => <circle key={x} cx={x} cy="103" r="7" fill="#1a1d23" />)}
    </svg>
  );
}

function Badge({ a, on }) {
  return (
    <div className={"badge-item" + (on ? " on" : "")} title={a.desc}>
      <span className="badge-icon" style={a.color && on ? { background: a.color, color: "#fff" } : null}>{on ? a.icon : "🔒"}</span>
      <b>{a.name}</b>
      <small>{a.desc}</small>
    </div>
  );
}
