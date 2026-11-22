import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import Drive, { RULES, START_PASSENGERS } from "../components/Drive";
import { LINES, LEVELS, buildTrip } from "../lib/lines";
import { say, setMuted, sfx } from "../lib/sound";
import { ACHIEVEMENTS, buySkin, dailyPlan, loadProgress, recordTrip, todayKey, equipSkin } from "../lib/progress";
import { SKINS, skinById } from "../lib/skins";
import { COMBO, EVENT_BONUS, EVENT_PENALTY, LATE_BONUS, simulate, WRONG_DOOR_PENALTY } from "../lib/rules";
import { drawTrainPreview } from "../components/scene";
import { makePoster } from "../lib/poster";
import { apiEnabled, fetchDaily, submitDaily } from "../lib/api";

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
// 首页“读给我听”：给还不认字的小朋友
const HOW_TO = "怎么开地铁？按住绿色的加速按钮，列车就出发。快到站的时候，按住红色的刹车按钮，" +
  "让车头的绿色小箭头对准红色的停车牌。停稳以后，听广播说从哪边下车，就按那一边的开门按钮。" +
  "乘客上完了再按关门。如果有乘客跑过来，先等一等他。路上听到提示，就按中间黄色的按钮。" +
  "停得越准，上车的乘客越多，车上乘客最多的小司机获胜！";

// 称号：和“每站都精准停车”的满分人数比
function rankTitle(rs) {
  const top = simulate(rs.map(() => ({ kind: "precise" })));
  const ratio = (pax(rs) - START_PASSENGERS) / (top - START_PASSENGERS);
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
  const [globalTop, setGlobalTop] = useState(null); // 今日挑战全网排行
  const [myRanks, setMyRanks] = useState({}); // { 玩家序号: { rank, total } }

  useEffect(() => {
    setBoard(loadBoard());
    setProgress(loadProgress());
    const plan = dailyPlan(todayKey());
    setToday(plan);
    fetchDaily(plan.key, 10).then(setGlobalTop);
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
      let dir = Math.random() < 0.5 ? 1 : -1;
      let first = Math.floor(Math.random() * (n - stops));
      // 测试用：?route=线路.方向.起点 指定区间，例如 ?route=4.-1.5
      const pin = typeof location !== "undefined" && new URLSearchParams(location.search).get("route");
      const m = pin && /^(\d+)\.(-?1)\.(\d+)$/.exec(pin);
      if (m && +m[1] === line.id && +m[3] < n - stops) { dir = +m[2]; first = +m[3]; }
      const startIndex = dir > 0 ? first : first + stops;
      setTrip(buildTrip(line, startIndex, dir, stops));
    }
    setFresh([]);
    setMyRanks({});
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
    if (daily) {
      const who = turn;
      submitDaily(daily.key, { name: players[who] || "小司机", results, player: who }).then((r) => {
        if (r) setMyRanks((m) => ({ ...m, [who]: r }));
        fetchDaily(daily.key, 10).then(setGlobalTop);
      });
    }
    setBoard(saveScore(boardId, {
      name: players[turn] || "小司机", passengers: pax(results), score: sum(results),
      date: new Date().toLocaleDateString(),
    }));
    if (turn + 1 < players.length) {
      setScreen("handover");
      say(`${players[turn] || "小司机"}跑完啦，车上有${pax(results)}位乘客。请把手机交给${players[turn + 1]}。`, { interrupt: true });
    } else {
      sfx.win();
      setScreen("result");
      if (list.length === 2) {
        const d = beats(list[0], list[1]);
        say(d === 0 ? "平局！两位都很棒！" : `${d > 0 ? players[0] : players[1]}获胜啦！`, { interrupt: true });
      } else {
        say(`跑完啦！车上一共有${pax(results)}位乘客，真棒！`, { interrupt: true });
      }
    }
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
      setPoster(await makePoster({
        line, trip, name: players[p] || "小司机", results: rs, title: rankTitle(rs),
        dailyKey: daily && daily.key, rank: myRanks[p],
      }));
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
            <div className="quick three">
              <button className="daily-card" style={{ "--line": today.line.color }} onClick={openDaily}>
                <span className="dc-tag">📅 今日挑战</span>
                <b>{today.line.name}</b>
                <span className="dc-route">
                  {buildTrip(today.line, today.startIndex, today.dir, today.stops).names[0]} →{" "}
                  {buildTrip(today.line, today.startIndex, today.dir, today.stops).names[today.stops]} · {today.stops} 站
                </span>
                <span className="dc-best">{myDaily ? `今天最好：${myDaily.passengers} 人` : "每天一题，和同学比比谁接的人多！"}</span>
                {globalTop && globalTop.total > 0 && (
                  <span className="dc-global">🌏 今天全城 {globalTop.total} 位司机参加 · 第一名 {globalTop.top[0].name} {globalTop.top[0].passengers} 人</span>
                )}
              </button>
              <button className="album-card" onClick={() => setScreen("album")}>
                <span className="dc-tag">📖 集站手册</span>
                <b>{visitedCount} / {totalStations}</b>
                <span className="dc-route">已点亮的车站</span>
                <span className="dc-best">🏅 成就 {progress ? progress.unlocked.length : 0} / {ACHIEVEMENTS.length}</span>
              </button>
              <button className="album-card garage-card" onClick={() => setScreen("garage")}>
                <span className="dc-tag">🎨 车库</span>
                <b>🪙 {progress ? progress.coins : 0}</b>
                <span className="dc-route">金币换车身涂装</span>
                <span className="dc-best">正在用：{skinById(progress && progress.skin).name}</span>
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

          <h2 className="step-title">
            <span className="step-no">2</span>怎么开地铁？
            <button className="read-btn" onClick={() => { sfx.unlock(); say(HOW_TO, { interrupt: true }); }}>🔊 读给我听</button>
          </h2>
          <div className="how-cards">
            <div className="how-card"><span className="hc-icon go">🚀</span><b>按住加速</b><span>列车出发，松开会慢慢滑行</span></div>
            <div className="how-card"><span className="hc-icon brake">✋</span><b>按住刹车</b><span>快到站时减速，看信号灯提示</span></div>
            <div className="how-card"><span className="hc-icon stop">停</span><b>对准停车牌</b><span>绿色箭头 ▼ 对准红色“停”牌</span></div>
            <div className="how-card"><span className="hc-icon door">🚪</span><b>听广播开车门</b><span>“请从左侧车门下车”就按开左门；乘客上完再关门</span></div>
            <div className="how-card"><span className="hc-icon limit">50</span><b>看到限速牌</b><span>要减到牌子上的速度以下</span></div>
          </div>

          <h2 className="step-title"><span className="step-no">3</span>接乘客，比人数</h2>
          <div className="rule-cards">
            <div className="rule precise"><b>🎯 精准停车</b><span>上车 {RULES.precise.board} 人</span><span>下车 {RULES.precise.alight} 人</span></div>
            <div className="rule rough"><b>😅 没停准</b><span>上车 {RULES.rough.board} 人</span><span>下车 {RULES.rough.alight} 人</span></div>
            <div className="rule missed"><b>😡 冲过站</b><span>没人上车</span><span>下车 {RULES.missed.alight} 人</span></div>
          </div>
          <div className="rule-cards extra">
            <div className="rule combo"><b>🔥 连击</b><span>连续精准停车，上车人数</span><span>×{COMBO[2]} → ×{COMBO[3]} → ×{COMBO[4]}</span></div>
            <div className="rule door"><b>🚪 开错门</b><span>乘客等急了</span><span>少上 {WRONG_DOOR_PENALTY} 人</span></div>
            <div className="rule late"><b>🏃 等等迟到乘客</b><span>有人跑来时先别关门</span><span>多上 {LATE_BONUS} 人</span></div>
          </div>
          <div className="rule-cards extra">
            <div className="rule event"><b>📢 🔔 小事件</b><span>乘客紧急呼叫、前方施工人员</span><span>6 秒内按按钮：+{EVENT_BONUS}，没按 −{EVENT_PENALTY}</span></div>
            <div className="rule work"><b>🚧 施工区</b><span>临时限速 40</span><span>不超速 +{EVENT_BONUS}，超速 −{EVENT_PENALTY}</span></div>
          </div>
          <p className="note center-note">出发时车上有 {START_PASSENGERS} 人，每上来一位乘客赚 1 枚 🪙 金币。跑完全程，<b>车上乘客最多</b>的司机获胜！</p>
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
            {daily && apiEnabled() && <p className="note">🌏 今日挑战的成绩会上全城排行榜，名字请用昵称，不要写真实姓名哦。</p>}
            {pk && <p className="note">两位司机轮流开同一段路，最后车上乘客多的获胜！</p>}
            <button className="big go wide start-btn" onClick={start}>出发！🚇</button>
          </div>

          {daily && globalTop && <GlobalBoard data={globalTop} />}
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
          onFinish={finish} onQuit={() => setScreen("setup")} muted={mute} onMute={() => setMute(!mute)}
          skin={skinById(progress && progress.skin)} />
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
                <p className="note">
                  驾驶分 {sum(rs)} · 精准停车 {rs.filter((r) => r.kind === "precise").length}/{rs.length} 站
                  · 最高连击 {Math.max(0, ...rs.map((r) => r.combo || 0))} · 🪙 赚了 <b>{rs.reduce((n, r) => n + (r.coins || 0), 0)}</b> 金币
                </p>
                {daily && myRanks[p] && (
                  <p className="global-rank">🌏 全城第 <b>{myRanks[p].rank}</b> 名（今天共 {myRanks[p].total} 位司机）</p>
                )}
                <button className="big share-btn" disabled={posterBusy} onClick={() => share(p)}>📸 生成分享海报</button>
                <table className="detail">
                  <tbody>
                    {rs.map((r, i) => (
                      <tr key={i}>
                        <td>{r.station}</td>
                        <td>{r.missed ? "冲过站" : `偏差 ${Math.abs(r.err).toFixed(1)} 米`}</td>
                        <td>⬆️{r.board}{r.mult > 1 ? "🔥" : ""} ⬇️{r.alight}{r.wrongDoor ? " 🚪✗" : ""}{r.lateBonus ? " 🏃" : ""}{r.event === "ok" ? " ✅" : r.event === "fail" ? " ⚠️" : ""}</td>
                        <td><b>{r.onboard}</b> 人</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          {daily && globalTop && <GlobalBoard data={globalTop} />}
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

      {screen === "garage" && progress && (
        <div className="page garage">
          <button className="back-btn" onClick={() => setScreen("home")}>← 回到首页</button>
          <h1 className="logo small">🎨 车库</h1>
          <p className="sub">每上来一位乘客赚 1 枚金币。攒够了就能换新涂装，开车时整列车都会换上！</p>
          <div className="coin-bank">🪙 <b>{progress.coins}</b> 枚金币</div>
          <div className="skins">
            {SKINS.map((sk) => {
              const owned = progress.skins.includes(sk.id);
              const using = progress.skin === sk.id;
              return (
                <div key={sk.id} className={"skin-card" + (using ? " using" : "")}>
                  <SkinPreview skin={sk} />
                  <b>{sk.name}</b>
                  <span className="skin-desc">{sk.desc}</span>
                  {using ? <button className="skin-btn using" disabled>✔ 正在使用</button>
                    : owned ? <button className="skin-btn" onClick={() => setProgress(equipSkin(sk.id))}>换上</button>
                    : (
                      <button className="skin-btn buy" disabled={progress.coins < sk.price}
                        onClick={() => { const r = buySkin(sk.id); if (r.ok) { setProgress(r.p); sfx.win(); if (r.fresh.length) setFresh(r.fresh); } }}>
                        🪙 {sk.price} {progress.coins < sk.price ? `（还差 ${sk.price - progress.coins}）` : "兑换"}
                      </button>
                    )}
                </div>
              );
            })}
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

function GlobalBoard({ data }) {
  return (
    <div className="panel global-board">
      <h3>🌏 今日全城排行榜 <small>共 {data.total} 位司机</small></h3>
      {data.top.length === 0 ? <p className="note">今天还没有人上榜，快来当第一名！</p> : (
        <ol className="board">
          {data.top.map((e) => (
            <li key={e.rank}>
              <span className="medal">{["🥇", "🥈", "🥉"][e.rank - 1] || e.rank}</span>
              <span>{e.name}</span>
              <b>{e.passengers} 人</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SkinPreview({ skin }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const d = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 260, h = cv.clientHeight || 110;
    cv.width = w * d; cv.height = h * d;
    const c = cv.getContext("2d");
    c.setTransform(d, 0, 0, d, 0, 0);
    drawTrainPreview(c, w, h, skin, LINES[0]);
  }, [skin]);
  return <canvas ref={ref} className="skin-preview" />;
}
