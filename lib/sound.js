// 声音：到站播报用浏览器自带的中文语音，提示音用 WebAudio 合成
let ctx = null;
let muted = false;

export function setMuted(m) {
  muted = m;
  if (m && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function audio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = "sine", vol = 0.15) {
  const a = audio();
  if (!a || muted) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  unlock: () => audio(),
  chime: () => { tone(880, 0, 0.35); tone(660, 0.3, 0.5); },
  doorClose: () => { for (let i = 0; i < 4; i++) tone(1200, i * 0.18, 0.1, "square", 0.06); },
  perfect: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, "triangle", 0.18)),
  good: () => [523, 659].forEach((f, i) => tone(f, i * 0.12, 0.25, "triangle", 0.15)),
  miss: () => { tone(300, 0, 0.3, "sawtooth", 0.1); tone(200, 0.25, 0.5, "sawtooth", 0.1); },
  warn: () => tone(1500, 0, 0.12, "square", 0.05),
  win: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.3, "triangle", 0.18)),
};

function voiceFor(lang) {
  const vs = window.speechSynthesis.getVoices();
  if (lang === "en") {
    return vs.find((x) => /en[-_]US/i.test(x.lang)) || vs.find((x) => /^en/i.test(x.lang));
  }
  return vs.find((x) => /zh[-_]CN/i.test(x.lang)) || vs.find((x) => /^zh/i.test(x.lang));
}

// 播报：先中文，再英文。en 是片段数组：字符串用英文语音读，{ zh: 站名 } 用中文语音读
export function speak(zh, en) {
  if (muted || typeof window === "undefined" || !window.speechSynthesis) return;
  const s = window.speechSynthesis;
  s.cancel();
  const queue = [[zh, "zh"]];
  (en || []).forEach((x) => {
    if (typeof x === "string") {
      const t = x.replace(/^[\s.,]+/, "").trim();
      if (/[a-z]/i.test(t)) queue.push([t, "en"]);
    } else queue.push([x.zh, "zh"]);
  });
  queue.forEach(([text, lang]) => {
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "en" ? "en-US" : "zh-CN";
    u.rate = lang === "en" ? 0.95 : 1;
    u.pitch = 1.05;
    const v = voiceFor(lang);
    if (v) u.voice = v;
    s.speak(u);
  });
}
