'use strict';

/* ================= Yandex Games SDK ================= */

let ysdk = null;
let sdkReady = false;

/* ================= Локализация ================= */

const I18N = {
  ru: {
    title: '🍉 Фруктовый ниндзя',
    intro: 'Режь фрукты свайпом. Не задевай бомбы 💣 и не роняй фрукты!',
    play: 'Играть',
    again: 'Ещё раз',
    over: '💥 Игра окончена',
    score: 'Счёт: ',
    best: 'Рекорд: ',
    combo: 'Комбо x{n}!',
  },
  en: {
    title: '🍉 Ninja Fruit Slash',
    intro: 'Slice fruit with swipes. Avoid bombs 💣 and don\'t drop the fruit!',
    play: 'Play',
    again: 'Play again',
    over: '💥 Game over',
    score: 'Score: ',
    best: 'Best: ',
    combo: 'Combo x{n}!',
  },
};

let L = I18N.ru;

function applyLang() {
  let lang = '';
  if (ysdk && ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang) {
    lang = ysdk.environment.i18n.lang;
  } else {
    lang = (navigator.language || 'ru').slice(0, 2);
  }
  L = I18N[lang] || I18N.en;
  document.documentElement.lang = lang === 'ru' ? 'ru' : 'en';
  document.title = L.title.replace(/^\S+\s/, '');
  overlayEl.querySelector('h1').textContent = L.title;
  overlayTextEl.textContent = L.intro;
  startBtn.textContent = L.play;
}

function initSDK() {
  if (typeof YaGames === 'undefined' || window.__ysdkFailed) {
    sdkReady = true;
    return Promise.resolve();
  }
  return YaGames.init()
    .then((sdk) => {
      ysdk = sdk;
      sdkReady = true;
      if (ysdk.features && ysdk.features.LoadingAPI) {
        ysdk.features.LoadingAPI.ready();
      }
    })
    .catch(() => {
      sdkReady = true;
    });
}

function gameplayStart() {
  if (ysdk && ysdk.features && ysdk.features.GameplayAPI) {
    ysdk.features.GameplayAPI.start();
  }
}

function gameplayStop() {
  if (ysdk && ysdk.features && ysdk.features.GameplayAPI) {
    ysdk.features.GameplayAPI.stop();
  }
}

function loadBest() {
  try {
    return Number(localStorage.getItem('fruit-ninja-best')) || 0;
  } catch (e) {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem('fruit-ninja-best', String(value));
  } catch (e) { /* iframe без localStorage — не критично */ }
  if (ysdk && ysdk.getPlayer) {
    ysdk.getPlayer({ scopes: false })
      .then((player) => player.setData({ best: value }))
      .catch(() => {});
  }
}

/* ================= Canvas ================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/* ================= Звук (Web Audio, без файлов) ================= */

const audio = {
  ctx: null,
  ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
};

function tone(freq, dur, opts) {
  const o = opts || {};
  const actx = audio.ensure();
  if (!actx) return;
  const t0 = actx.currentTime + (o.delay || 0);
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + o.slide), t0 + dur);
  g.gain.setValueAtTime(o.vol || 0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(actx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur, opts) {
  const o = opts || {};
  const actx = audio.ensure();
  if (!actx) return;
  const t0 = actx.currentTime + (o.delay || 0);
  const len = Math.ceil(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(o.freq || 1000, t0);
  f.Q.value = o.q || 1;
  if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(20, (o.freq || 1000) + o.slide), t0 + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(o.vol || 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(actx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const sfx = {
  start() { tone(500, 0.1, { type: 'triangle', vol: 0.15, slide: 200 }); },
  slice() {
    noise(0.12, { vol: 0.25, freq: 2500, slide: -1800, q: 2 });
    tone(700, 0.08, { type: 'triangle', vol: 0.12, slide: -300 });
  },
  boom() {
    noise(0.5, { vol: 0.5, freq: 400, slide: -350, q: 0.7 });
    tone(120, 0.5, { type: 'sine', vol: 0.5, slide: -80 });
  },
  drop() { tone(300, 0.25, { type: 'square', vol: 0.08, slide: -150 }); },
  combo() { [660, 880, 1100].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.15, delay: i * 0.07 })); },
  over() { [400, 300, 200].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.12, delay: i * 0.18 })); },
};

/* ================= Данные фруктов ================= */

const FRUITS = [
  { name: 'watermelon', r: 44, skin: '#2e7d32', flesh: '#ef5350', juice: '#e53935', score: 1 },
  { name: 'orange',     r: 32, skin: '#fb8c00', flesh: '#ffb74d', juice: '#fb8c00', score: 1 },
  { name: 'apple',      r: 30, skin: '#c62828', flesh: '#fff3e0', juice: '#ef9a9a', score: 1 },
  { name: 'lime',       r: 26, skin: '#9ccc65', flesh: '#dcedc8', juice: '#aed581', score: 2 },
  { name: 'plum',       r: 24, skin: '#6a1b9a', flesh: '#f3e5f5', juice: '#ab47bc', score: 2 },
];

const GRAVITY = 900; // px/s^2

/* ================= Состояние ================= */

const state = {
  running: false,
  paused: false,
  score: 0,
  best: loadBest(),
  lives: 3,
  fruits: [],      // летающие целые фрукты и бомбы
  halves: [],      // разрезанные половинки
  particles: [],   // брызги сока
  trail: [],       // след клинка
  spawnTimer: 0,
  elapsed: 0,
  comboCount: 0,
  comboTimer: 0,
};

const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const livesEl = document.getElementById('lives');
const overlayEl = document.getElementById('overlay');
const overlayTextEl = document.getElementById('overlay-text');
const bestEl = document.getElementById('best');
const startBtn = document.getElementById('start-btn');

function updateHud() {
  scoreEl.textContent = state.score;
  livesEl.textContent = '❤️'.repeat(state.lives) + '🖤'.repeat(Math.max(0, 3 - state.lives));
}

/* ================= Спавн ================= */

function difficulty() {
  // от 1 до ~2.5 за две минуты игры
  return 1 + Math.min(1.5, state.elapsed / 80);
}

function spawnOne() {
  const isBomb = Math.random() < Math.min(0.18, 0.06 + state.elapsed / 400);
  const type = FRUITS[Math.floor(Math.random() * FRUITS.length)];
  const r = isBomb ? 28 : type.r;
  const x = W * (0.15 + Math.random() * 0.7);
  const targetX = W * (0.2 + Math.random() * 0.6);
  const flightTime = 1.1 + Math.random() * 0.5;
  const peak = H * (0.12 + Math.random() * 0.2);
  // подбираем vy так, чтобы фрукт долетел примерно до peak
  const vy = -Math.sqrt(2 * GRAVITY * (H - peak));
  const vx = (targetX - x) / flightTime;

  state.fruits.push({
    isBomb,
    type,
    x,
    y: H + r,
    vx,
    vy,
    r,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 4,
  });
}

function spawnWave() {
  const count = 1 + Math.floor(Math.random() * Math.min(4, 1 + state.elapsed / 25));
  for (let i = 0; i < count; i++) {
    setTimeout(() => { if (state.running && !state.paused) spawnOne(); }, i * 150);
  }
}

/* ================= Разрезание ================= */

function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
}

function sliceFruit(f, angle) {
  sfx.slice();
  const t = f.type;
  for (const dir of [-1, 1]) {
    state.halves.push({
      type: t,
      x: f.x,
      y: f.y,
      vx: f.vx + Math.cos(angle + Math.PI / 2) * dir * 140,
      vy: f.vy + Math.sin(angle + Math.PI / 2) * dir * 140 - 60,
      r: f.r,
      rot: angle,
      vrot: dir * 5,
      side: dir,
      life: 2,
    });
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 260;
    state.particles.push({
      x: f.x,
      y: f.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 100,
      r: 2 + Math.random() * 5,
      color: t.juice,
      life: 0.7 + Math.random() * 0.5,
    });
  }
}

function explodeBomb(f) {
  sfx.boom();
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 400;
    state.particles.push({
      x: f.x,
      y: f.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: 2 + Math.random() * 6,
      color: Math.random() < 0.5 ? '#ffb300' : '#757575',
      life: 0.5 + Math.random() * 0.6,
    });
  }
}

function checkSlices() {
  if (state.trail.length < 2) return;
  const a = state.trail[state.trail.length - 2];
  const b = state.trail[state.trail.length - 1];
  const speed = Math.hypot(b.x - a.x, b.y - a.y);
  if (speed < 6) return; // медленное касание не режет

  const angle = Math.atan2(b.y - a.y, b.x - a.x);

  for (let i = state.fruits.length - 1; i >= 0; i--) {
    const f = state.fruits[i];
    if (!segCircle(a.x, a.y, b.x, b.y, f.x, f.y, f.r)) continue;
    state.fruits.splice(i, 1);
    if (f.isBomb) {
      explodeBomb(f);
      gameOver();
      return;
    }
    sliceFruit(f, angle);
    state.comboCount += 1;
    state.comboTimer = 0.35;
    if (state.comboCount === 3) sfx.combo();
    const gained = f.type.score * (state.comboCount >= 3 ? 2 : 1);
    state.score += gained;
    updateHud();
  }
}

/* ================= Жизненный цикл ================= */

function startGame() {
  audio.ensure();
  sfx.start();
  state.running = true;
  state.paused = false;
  state.score = 0;
  state.lives = 3;
  state.fruits = [];
  state.halves = [];
  state.particles = [];
  state.trail = [];
  state.spawnTimer = 0.5;
  state.elapsed = 0;
  state.comboCount = 0;
  state.comboTimer = 0;
  overlayEl.classList.add('hidden');
  updateHud();
  gameplayStart();
}

function gameOver() {
  sfx.over();
  state.running = false;
  gameplayStop();
  if (state.score > state.best) {
    state.best = state.score;
    saveBest(state.best);
  }
  overlayEl.querySelector('h1').textContent = L.over;
  overlayTextEl.textContent = L.score + state.score;
  bestEl.textContent = L.best + state.best;
  startBtn.textContent = L.again;
  overlayEl.classList.remove('hidden');
}

startBtn.addEventListener('click', startGame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.paused = true;
    if (state.running) gameplayStop();
    if (audio.ctx) audio.ctx.suspend();
  } else {
    state.paused = false;
    lastTime = performance.now();
    if (state.running) gameplayStart();
    if (audio.ctx) audio.ctx.resume();
  }
});

/* ================= Ввод ================= */

let pointerDown = false;

function addTrailPoint(x, y) {
  state.trail.push({ x, y, t: performance.now() });
  if (state.trail.length > 24) state.trail.shift();
}

canvas.addEventListener('pointerdown', (e) => {
  pointerDown = true;
  state.trail = [];
  addTrailPoint(e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointerDown) return;
  addTrailPoint(e.clientX, e.clientY);
  if (state.running && !state.paused) checkSlices();
});

window.addEventListener('pointerup', () => {
  pointerDown = false;
  state.comboCount = 0;
});

/* ================= Отрисовка ================= */

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#241832');
  g.addColorStop(1, '#120b1c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawFruit(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  if (f.isBomb) {
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#546e7a';
    ctx.lineWidth = 3;
    ctx.stroke();
    // фитиль
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -f.r);
    ctx.quadraticCurveTo(10, -f.r - 14, 18, -f.r - 10);
    ctx.stroke();
    // искра
    ctx.fillStyle = '#ffca28';
    ctx.beginPath();
    ctx.arc(18, -f.r - 10, 4 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = f.type.skin;
    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fill();
    // блик
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(-f.r * 0.35, -f.r * 0.35, f.r * 0.3, f.r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (f.type.name === 'watermelon') {
      ctx.strokeStyle = '#1b5e20';
      ctx.lineWidth = 5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * f.r * 0.5, 0, f.r * 0.9, Math.PI * 0.35, Math.PI * 0.65);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawHalf(h) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rot);
  ctx.globalAlpha = Math.min(1, h.life);
  const start = h.side > 0 ? 0 : Math.PI;
  // мякоть
  ctx.fillStyle = h.type.flesh;
  ctx.beginPath();
  ctx.arc(0, 0, h.r, start, start + Math.PI);
  ctx.closePath();
  ctx.fill();
  // корка
  ctx.strokeStyle = h.type.skin;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, h.r - 3, start, start + Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawTrail() {
  const now = performance.now();
  const pts = state.trail.filter((p) => now - p.t < 160);
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const alpha = i / pts.length;
    ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.9) + ')';
    ctx.lineWidth = 2 + alpha * 8;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/* ================= Игровой цикл ================= */

let lastTime = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state.paused) return;

  drawBackground();

  if (state.running) {
    state.elapsed += dt;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnWave();
      state.spawnTimer = (1.6 + Math.random() * 1.2) / difficulty();
    }

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.comboCount = 0;
    }
    if (state.comboCount >= 3) {
      comboEl.textContent = L.combo.replace('{n}', state.comboCount);
      comboEl.classList.add('show');
    } else {
      comboEl.classList.remove('show');
    }
  }

  // целые фрукты
  for (let i = state.fruits.length - 1; i >= 0; i--) {
    const f = state.fruits[i];
    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vrot * dt;
    if (f.y - f.r > H + 40) {
      state.fruits.splice(i, 1);
      if (!f.isBomb && state.running) {
        state.lives -= 1;
        sfx.drop();
        updateHud();
        if (state.lives <= 0) gameOver();
      }
    }
  }

  // половинки
  for (let i = state.halves.length - 1; i >= 0; i--) {
    const h = state.halves[i];
    h.vy += GRAVITY * dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.rot += h.vrot * dt;
    h.life -= dt;
    if (h.y - h.r > H + 40 || h.life <= 0) state.halves.splice(i, 1);
  }

  // частицы
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.vy += GRAVITY * 0.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const h of state.halves) drawHalf(h);
  for (const f of state.fruits) drawFruit(f);
  drawTrail();
}

/* ================= Запуск ================= */

initSDK().then(() => {
  applyLang();
  bestEl.textContent = state.best > 0 ? L.best + state.best : '';
  updateHud();
  requestAnimationFrame(tick);
});
