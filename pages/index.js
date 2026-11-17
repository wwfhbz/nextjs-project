import Head from "next/head";
import { useEffect, useState } from "react";
import Drive from "../components/Drive";
import { LINES, LEVELS, buildTrip } from "../lib/lines";
import { setMuted, sfx } from "../lib/sound";

const LENGTHS = [
  { stops: 3, label: "短途 3 站" },
  { stops: 5, label: "标准 5 站" },
  { stops: 8, label: "长途 8 站" },
];
const KEY = "metro-rush-board-v1";

function loadBoard() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function saveScore(id, entry) {
  const b = loadBoard();
  b[id] = [...(b[id] || []), entry].sort((x, y) => y.score - x.score).slice(0, 10);
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {}
  return b;
}
function rankTitle(avg) {
  if (avg >= 105) return "👑 王牌司机";
  if (avg >= 85) return "🥇 金牌司机";
  if (avg >= 60) return "🚇 正式司机";
  return "🌱 实习司机";
}
const sum = (rs) => rs.reduce((s, r) => s + r.total, 0);

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

  useEffect(() => setBoard(loadBoard()), []);
  useEffect(() => setMuted(mute), [mute]);

  const boardId = line ? `${line.id}-${stops}` : "";
  const players = pk ? names : names.slice(0, 1);

  function start() {
    sfx.unlock();
    const n = line.stations.length;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const first = Math.floor(Math.random() * (n - stops));
    const startIndex = dir > 0 ? first : first + stops;
    setTrip(buildTrip(line, startIndex, dir, stops));
    setAll([]);
    setTurn(0);
    setScreen("play");
  }

  function finish(results) {
    const list = [...all, results];
    setAll(list);
    setBoard(saveScore(boardId, {
      name: players[turn] || "小司机", score: sum(results), date: new Date().toLocaleDateString(),
    }));
    if (turn + 1 < players.length) setScreen("handover");
    else { sfx.win(); setScreen("result"); }
  }

  const top = (board[boardId] || []).slice(0, 5);

  return (
    <div className="app">
      <Head>
        <title>地铁冲冲冲！</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <button className="mute" onClick={() => setMute(!mute)}>{mute ? "🔇" : "🔊"}</button>

      {screen === "home" && (
        <div className="page">
          <h1 className="logo">🚇 地铁冲冲冲！</h1>
          <p className="sub">当一回地铁小司机：加速、减速、精准停车，看谁停得最准！</p>
          <div className="lines">
            {LINES.map((l) => (
              <button key={l.id} className="line" style={{ background: l.color }}
                onClick={() => { sfx.unlock(); setLine(l); setScreen("setup"); }}>
                <b>{l.name}</b>
                <span>{l.stations[0]} ⇄ {l.stations[l.stations.length - 1]}</span>
                <em>{LEVELS[l.level].stars} {LEVELS[l.level].label}</em>
              </button>
            ))}
          </div>
          <div className="how">
            <h3>怎么玩？</h3>
            <ol>
              <li>按住 <b>🚀 加速</b> 让列车出发，松开就会慢慢滑行。</li>
              <li>快到站时按住 <b>🛑 刹车</b>，让车头的 <span className="tri">▼</span> 对准站台上的 <span className="stop">停</span>。</li>
              <li>停得越准、越准点，分数越高；冲过站台这一站就是 0 分！</li>
              <li>看到圆形限速牌要减速，超速会被扣分哦。</li>
            </ol>
          </div>
        </div>
      )}

      {screen === "setup" && line && (
        <div className="page">
          <h1 className="logo small">
            <span className="badge" style={{ background: line.color }}>{line.name}</span>
            {LEVELS[line.level].stars} {LEVELS[line.level].label}线路
          </h1>
          <p className="sub">
            停车允许误差 ±{LEVELS[line.level].tol} 米 · 最高时速 {LEVELS[line.level].vmax} km/h
            {LEVELS[line.level].limit ? " · 有限速区" : ""}{LEVELS[line.level].hint ? " · 有刹车提示灯" : " · 没有刹车提示"}
          </p>
          <div className="panel">
            <h3>玩法</h3>
            <div className="seg">
              <button className={!pk ? "on" : ""} onClick={() => setPk(false)}>🧑‍✈️ 单人挑战</button>
              <button className={pk ? "on" : ""} onClick={() => setPk(true)}>⚔️ 双人对战</button>
            </div>
            <h3>路程</h3>
            <div className="seg">
              {LENGTHS.map((o) => (
                <button key={o.stops} className={stops === o.stops ? "on" : ""} onClick={() => setStops(o.stops)}>{o.label}</button>
              ))}
            </div>
            <h3>司机名字</h3>
            <div className="names">
              {players.map((n, i) => (
                <input key={i} value={n} maxLength={8} placeholder={`司机 ${i + 1}`}
                  onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
              ))}
            </div>
            {pk && <p className="note">两位司机轮流开同一段路，总分高的获胜！</p>}
            <button className="big go wide" onClick={start}>出发！🚀</button>
            <button className="mini back" onClick={() => setScreen("home")}>← 换条线路</button>
          </div>
          <div className="panel">
            <h3>🏆 {line.name} · {stops} 站排行榜</h3>
            {top.length === 0 ? <p className="note">还没有成绩，快来当第一名！</p> : (
              <ol className="board">
                {top.map((e, i) => <li key={i}><span>{e.name}</span><b>{e.score}</b></li>)}
              </ol>
            )}
          </div>
        </div>
      )}

      {screen === "play" && (
        <Drive key={turn} line={line} trip={trip} player={players[turn] || "小司机"}
          onFinish={finish} onQuit={() => setScreen("setup")} />
      )}

      {screen === "handover" && (
        <div className="page center">
          <h1 className="logo small">{players[turn]} 跑完啦！得分 {sum(all[turn])}</h1>
          <p className="sub">把设备交给下一位司机：<b>{players[turn + 1]}</b></p>
          <button className="big go wide" onClick={() => { setTurn(turn + 1); setScreen("play"); }}>我准备好了！🚀</button>
        </div>
      )}

      {screen === "result" && (
        <div className="page">
          <h1 className="logo small">🏁 行程结束</h1>
          {pk && (() => {
            const a = sum(all[0]), b = sum(all[1]);
            return <p className="winner">{a === b ? "🤝 平局！两位都很棒" : `🎉 ${a > b ? players[0] : players[1]} 获胜！`}</p>;
          })()}
          <div className="results">
            {all.map((rs, p) => (
              <div className="panel" key={p}>
                <h3>{players[p]} <span className="title">{rankTitle(sum(rs) / rs.length)}</span></h3>
                <div className="totalscore">{sum(rs)}<small> 分</small></div>
                <table className="detail">
                  <tbody>
                    {rs.map((r, i) => (
                      <tr key={i}>
                        <td>{r.station}</td>
                        <td>{r.missed ? "冲过站" : `偏差 ${Math.abs(r.err).toFixed(1)} 米`}</td>
                        <td>{"⭐".repeat(r.stars) || "—"}</td>
                        <td><b>{r.total}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div className="panel">
            <h3>🏆 {line.name} · {stops} 站排行榜</h3>
            <ol className="board">
              {top.map((e, i) => <li key={i}><span>{e.name}</span><b>{e.score}</b></li>)}
            </ol>
          </div>
          <div className="row">
            <button className="big go" onClick={start}>再来一次 🔁</button>
            <button className="big alt" onClick={() => setScreen("home")}>换条线路 🗺️</button>
          </div>
        </div>
      )}
    </div>
  );
}
