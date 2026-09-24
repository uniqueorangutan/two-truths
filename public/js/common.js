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

export function leaderboardHtml(rows, youId) {
  if (!rows?.length) return '<p class="muted">No scores yet.</p>';
  return `<table class="leaderboard">
    <thead><tr><th>#</th><th>Name</th><th title="Correct guesses">Guessed</th><th title="Players fooled">Fooled</th><th>Points</th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr class="${r.rank === 1 ? 'first' : ''} ${r.id === youId ? 'you' : ''}">
        <td class="rank">${rows.filter((o) => o.rank === r.rank).length > 1 ? '=' : ''}${r.rank}</td><td>${esc(r.name)}</td><td>${r.correct}</td><td>${r.fooled}</td><td class="score">${r.score}</td></tr>`,
      )
      .join('')}</tbody></table>`;
}
