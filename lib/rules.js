// 接乘客规则：游戏（components/Drive.js）和全网排行榜服务（server/leaderboard.js）共用这一份
// 用 CommonJS 写，Node 服务端可以直接 require，前端打包工具也能 import。

const START_PASSENGERS = 100;

// 每站基础上下车人数
const RULES = {
  precise: { board: 100, alight: 30 }, // 精准停车
  rough: { board: 30, alight: 50 }, // 没停准
  missed: { board: 0, alight: 50 }, // 冲过站
};

// 连续精准停车的上车人数加成：第 1 次 ×1，第 2 次 ×1.2，第 3 次 ×1.5，第 4 次起 ×2
const COMBO = [1, 1, 1.2, 1.5, 2];
function comboMult(combo) {
  return COMBO[Math.min(combo, COMBO.length - 1)];
}

const WRONG_DOOR_PENALTY = 20; // 开错门：等车的乘客着急，少上 20 人
const LATE_BONUS = 10; // 等到最后跑来的乘客：多上 10 人

// 计算一站的结果。stop = { kind, wrongDoor, lateBonus }
function stopOutcome(before, combo, stop) {
  const base = RULES[stop.kind];
  const nextCombo = stop.kind === "precise" ? combo + 1 : 0;
  const mult = stop.kind === "precise" ? comboMult(nextCombo) : 1;
  let board = Math.round(base.board * mult);
  if (stop.kind !== "missed") {
    if (stop.wrongDoor) board = Math.max(0, board - WRONG_DOOR_PENALTY);
    if (stop.lateBonus) board += LATE_BONUS;
  }
  const alight = Math.min(before, base.alight);
  return { alight, board, onboard: before - alight + board, combo: nextCombo, mult };
}

// 从头算一整趟，返回最后车上的人数
function simulate(stops) {
  let n = START_PASSENGERS, combo = 0;
  for (const st of stops) {
    const r = stopOutcome(n, combo, st);
    n = r.onboard;
    combo = r.combo;
  }
  return n;
}

module.exports = { START_PASSENGERS, RULES, COMBO, comboMult, WRONG_DOOR_PENALTY, LATE_BONUS, stopOutcome, simulate };
