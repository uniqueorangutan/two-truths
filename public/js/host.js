import { api, esc, startPolling, toast, paint, plural, statementsHtml, resultHtml, leaderboardHtml } from './common.js';

const PIN_KEY = 'two-truths-host-pin';
const app = document.getElementById('app');

let pin = readPin();
let state = null;
let busy = false;
let poll = null;

function readPin() {
  try {
    return sessionStorage.getItem(PIN_KEY) || '';
  } catch {
    return '';
  }
}
function storePin(value) {
  pin = value;
  try {
    value ? sessionStorage.setItem(PIN_KEY, value) : sessionStorage.removeItem(PIN_KEY);
  } catch {
    /* PIN just won't survive a refresh */
  }
}

function showPinForm(message = '') {
  delete app.dataset.html;
  app.innerHTML = `
    <header class="hero"><h1>Host controls</h1></header>
    <form id="pin-form" class="card">
      <label for="pin">Host PIN</label>
      <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="off" required>
      ${message ? `<p class="error">${esc(message)}</p>` : ''}
      <button class="btn primary" type="submit">Open host view</button>
    </form>`;
  app.querySelector('#pin').focus();
}

async function refresh() {
  try {
    state = await api('/api/host-state', { pin });
  } catch (err) {
    if (err.status === 401) {
      poll.stop();
      storePin('');
      state = null;
      return showPinForm('That PIN didn’t work.');
    }
    throw err;
  }
  render();
}

function begin() {
  poll?.stop();
  poll = startPolling(refresh, (err) => toast(err.message));
}

// ---------- rendering ----------

const STATUS_LABEL = { showing: 'Up next', voting: 'Voting open', revealed: 'Revealed', skipped: 'Skipped' };

function render() {
  const { phase } = state;
  const body = phase === 'lobby' ? lobbyHtml() : phase === 'leaderboard' ? finalHtml() : playingHtml();
  paint(
    app,
    `${body}
    <section class="danger-zone">
      <button class="btn danger" data-action="reset" ${busy ? 'disabled' : ''}>Reset game</button>
      <p class="muted">Clears all players, entries and votes.</p>
    </section>`,
  );
}

function lobbyHtml() {
  const players = state.players;
  const submitted = players.filter((p) => p.submitted).length;
  const link = `${location.origin}/`;
  return `
    <header><p class="eyebrow">Host · Lobby</p><h1>${submitted} of ${players.length} submitted</h1></header>
    <section class="card share">
      <p>Players join at</p>
      <p class="link">${esc(link)}</p>
      <button class="btn" data-action="copy-link" data-link="${esc(link)}">Copy link</button>
    </section>
    <ul class="roster">${
      players.length
        ? players
            .map(
              (p) => `<li class="${p.submitted ? 'done' : ''}"><span>${esc(p.name)}</span>
                <span class="status">${p.submitted ? '✓ Ready' : 'Writing…'}</span></li>`,
            )
            .join('')
        : '<li class="empty">Nobody has joined yet.</li>'
    }</ul>
    <button class="btn primary big" data-action="start" ${submitted && !busy ? '' : 'disabled'}>
      Start game${submitted ? ` with ${plural(submitted, 'player')}` : ''}</button>
    ${submitted < players.length && submitted ? '<p class="muted center">Anyone without an entry can still vote, but won’t get a round.</p>' : ''}`;
}

function playingHtml() {
  const { round, votes, order } = state;
  const d = busy ? 'disabled' : '';
  const first = round.number === 1;
  const last = round.number === round.total;
  const s = round.status;

  let middle = statementsHtml(round.statements);
  if (s === 'voting') {
    middle += `<section class="card vote-panel">
      <p class="big-number">${votes.count} <span>of ${votes.eligible} voted</span></p>
      ${
        votes.notVoted.length
          ? `<p class="muted">Waiting on:</p><div class="chips">${votes.notVoted.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>`
          : '<p class="good">Everyone has voted.</p>'
      }</section>`;
  } else if (s === 'revealed') {
    middle = resultHtml(round);
  } else if (s === 'skipped') {
    middle = '<p class="note">This round was skipped.</p>';
  }

  const primary =
    s === 'voting'
      ? `<button class="btn primary big" data-action="reveal" ${d}>Reveal the lie</button>`
      : s === 'revealed'
        ? last
          ? `<button class="btn primary big" data-action="leaderboard" ${d}>Show leaderboard</button>`
          : `<button class="btn primary big" data-action="next" ${d}>Next person →</button>`
        : `<button class="btn primary big" data-action="openVoting" ${d}>Open voting</button>`;

  return `
    <header class="round-head">
      <p class="eyebrow">Host · Person ${round.number} of ${round.total} · <span class="pill ${s}">${STATUS_LABEL[s]}</span></p>
      <h1>${esc(round.subject.name)}</h1>
    </header>
    ${middle}
    ${primary}
    <div class="controls">
      <button class="btn" data-action="back" ${first || busy ? 'disabled' : ''}>← Back</button>
      <button class="btn" data-action="skip" ${s === 'revealed' || busy ? 'disabled' : ''}>Skip person</button>
      <button class="btn" data-action="next" ${last || busy ? 'disabled' : ''}>Next person</button>
      <button class="btn" data-action="openVoting" ${s === 'voting' || s === 'revealed' || busy ? 'disabled' : ''}>Open voting</button>
      <button class="btn" data-action="reveal" ${s === 'revealed' || busy ? 'disabled' : ''}>Reveal</button>
      <button class="btn" data-action="leaderboard" ${d}>Show leaderboard</button>
    </div>
    <details class="card order">
      <summary>Running order</summary>
      <ol>${order
        .map((o) => `<li class="${o.current ? 'current' : ''}">${esc(o.name)} <span class="pill ${o.status}">${STATUS_LABEL[o.status]}</span></li>`)
        .join('')}</ol>
    </details>`;
}

function finalHtml() {
  return `
    <header><p class="eyebrow">Host · Game over</p><h1>Leaderboard</h1></header>
    ${leaderboardHtml(state.leaderboard)}
    <p class="muted center">+1 for each lie spotted, +1 for each person fooled.</p>
    <button class="btn" data-action="back" ${busy ? 'disabled' : ''}>← Back to the last round</button>`;
}

// ---------- actions ----------

const CONFIRM = {
  reset: 'Reset the game? This deletes every player, entry and vote.',
  skip: 'Skip this person? Their round won’t score.',
};

async function act(action) {
  if (busy) return;
  if (CONFIRM[action] && !confirm(CONFIRM[action])) return;
  busy = true;
  render();
  try {
    await api('/api/host-action', { method: 'POST', body: { action }, pin });
  } catch (err) {
    toast(err.message);
  } finally {
    busy = false;
    await poll();
  }
}

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id !== 'pin-form') return;
  storePin(e.target.elements.pin.value.trim());
  begin();
});

app.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  if (btn.dataset.action === 'copy-link') {
    try {
      await navigator.clipboard.writeText(btn.dataset.link);
      toast('Link copied', 'ok');
    } catch {
      toast('Couldn’t copy. Select the link and copy it manually.');
    }
    return;
  }
  act(btn.dataset.action);
});

if (pin) begin();
else showPinForm();
