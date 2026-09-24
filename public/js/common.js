export const LETTERS = ['A', 'B', 'C'];
export const POLL_MS = 1500;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function api(path, { method = 'GET', body, pin } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (pin) headers['x-host-pin'] = pin;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Something went wrong (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Calls fn now and then every POLL_MS after each call finishes.
// Returns a function that polls immediately; it also has .stop().
export function startPolling(fn, onError) {
  let timer;
  let generation = 0;
  let stopped = false;
  const tick = async () => {
    clearTimeout(timer);
    if (stopped) return;
    const mine = ++generation; // an immediate poll supersedes any in-flight one, so only one timer chain survives
    try {
      await fn();
    } catch (err) {
      onError?.(err);
    }
    if (!stopped && mine === generation) timer = setTimeout(tick, POLL_MS);
  };
  tick.stop = () => {
    stopped = true;
    clearTimeout(timer);
  };
  tick();
  return tick;
}

let toastTimer;
export function toast(message, kind = 'error') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 4000);
}

// Replaces container content only when the markup changed, so polling doesn't flicker.
export function paint(container, html) {
  if (container.dataset.html === html) return false;
  container.innerHTML = html;
  container.dataset.html = html;
  return true;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function statementsHtml(statements, { selectable = false, selected = null, mine = null } = {}) {
  return `<ol class="statements">${statements
    .map((text, i) => {
      const cls = ['statement', i === selected ? 'selected' : '', i === mine ? 'mine' : ''].join(' ');
      const inner = `<span class="letter">${LETTERS[i]}</span><span class="text">${esc(text)}</span>`;
      return selectable
        ? `<li><button type="button" class="${cls}" data-choice="${i}" aria-pressed="${i === selected}">${inner}</button></li>`
        : `<li><div class="${cls}">${inner}${i === mine ? '<span class="tag">Your vote</span>' : ''}</div></li>`;
    })
    .join('')}</ol>`;
}

export function resultHtml(round, youId) {
  const { liePos, tally } = round.result;
  const total = tally.reduce((n, list) => n + list.length, 0);
  return `<ol class="statements result">${round.statements
    .map((text, i) => {
      const voters = tally[i];
      const isLie = i === liePos;
      const pct = total ? Math.round((voters.length / total) * 100) : 0;
      return `<li><div class="statement ${isLie ? 'lie' : 'truth'}">
        <span class="letter">${LETTERS[i]}</span>
        <span class="text">${esc(text)}</span>
        <span class="verdict">${isLie ? 'The lie' : 'Truth'}</span>
        <div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <div class="votes-line"><strong>${plural(voters.length, 'vote')}</strong>
          ${voters.map((v) => `<span class="chip ${v.id === youId ? 'you' : ''}">${esc(v.name)}</span>`).join('')}
        </div>
      </div></li>`;
    })
    .join('')}</ol>`;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// Reveals that have already played their animation, so a repaint doesn't replay them.
const animatedReveals = new Set();

// `board` comes from the server with unrevealed rows as { hidden: true }, in final order,
// so the countdown fills in from the bottom. Rows revealed by the latest tap carry `latest`.
export function leaderboardHtml(board, youId) {
  if (!board?.rows.length) return '<p class="muted">No scores yet.</p>';
  const shown = board.rows.filter((r) => !r.hidden);
  const revealKey = `${board.step}:${shown.filter((r) => r.latest).map((r) => r.id).join()}`;
  const animate = !animatedReveals.has(revealKey);
  animatedReveals.add(revealKey);
  const tied = (rank) => shown.filter((o) => o.rank === rank).length > 1;
  const rows = board.rows
    .map((r) => {
      if (r.hidden) {
        return `<li class="row hidden-row" aria-label="Not revealed yet">
          <span class="rank">?</span><span class="name">??????</span>
          <span class="stat"></span><span class="stat"></span><span class="score">?</span></li>`;
      }
      const cls = ['row', r.rank === 1 ? 'first' : '', r.id === youId ? 'you' : '', r.latest ? 'latest' : '', r.latest && animate ? 'animate' : ''].join(' ');
      return `<li class="${cls}">
        <span class="rank">${r.rank === 1 ? '<span class="trophy" aria-hidden="true">🏆</span>' : ''}${tied(r.rank) ? '=' : ''}${r.rank}</span>
        <span class="name">${esc(r.name)}${r.id === youId ? ' <span class="you-tag">You</span>' : ''}</span>
        <span class="stat">${r.correct}</span><span class="stat">${r.fooled}</span>
        <span class="score">${r.score}</span></li>`;
    })
    .join('');
  return `<ol class="board">
    <li class="board-head" aria-hidden="true"><span>#</span><span>Name</span>
      <span class="stat" title="Lies spotted">Spotted</span><span class="stat" title="Players fooled">Fooled</span><span>Pts</span></li>
    ${rows}</ol>`;
}

// Brings a freshly revealed row into view (it may be far down the list on a big team).
export function scrollToReveal(container) {
  const row = container.querySelector('.board .row.animate');
  if (!row) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
}

// Fires confetti when this screen sees the winner revealed, but not on a reload after the fact.
export function confettiWatcher() {
  let sawCountdown = false;
  return (board) => {
    if (!board) return;
    if (!board.done) sawCountdown = true;
    else if (sawCountdown) {
      sawCountdown = false;
      setTimeout(confetti, 450); // let the winner's row land first
    }
  };
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const colours = ['#5b3df5', '#8b74ff', '#ff7d88', '#5fd69c', '#f0b64a', '#ffd84d'];
  // Two cannons, one from each bottom corner, aimed up and inwards.
  const pieces = Array.from({ length: 180 }, (_, i) => {
    const left = i % 2 === 0;
    return {
      x: left ? 0 : w,
      y: h,
      vx: (left ? 1 : -1) * (3 + Math.random() * 9) * (w / 900 + 0.5),
      vy: -(11 + Math.random() * 13) * (h / 900 + 0.4),
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.35,
      size: 6 + Math.random() * 7,
      colour: colours[i % colours.length],
      delay: Math.random() * 250,
    };
  });

  const DURATION = 4200;
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.min(1, Math.max(0, (DURATION - t) / 800));
    for (const p of pieces) {
      if (t < p.delay) continue;
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
