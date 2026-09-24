import { api, esc, startPolling, toast, paint, plural, statementsHtml, resultHtml, leaderboardHtml, LETTERS } from './common.js';

const STORAGE_KEY = 'two-truths-player';
const MAX_LEN = 150;
const app = document.getElementById('app');

let saved = load(); // { playerId, gameId }
let state = null;
let editing = false;
let selected = null; // statement picked but not yet locked in
let selectedFor = null; // subject ID that `selected` belongs to
let notice = '';
let busy = false;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}
function save(value) {
  saved = value;
  try {
    value ? localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) : localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the player just won't survive a refresh */
  }
}

async function refresh() {
  state = await api(`/api/state?playerId=${encodeURIComponent(saved?.playerId ?? '')}`);
  if (saved && !state.you) {
    save(null);
    editing = false;
    notice = 'The host reset the game. Please join again.';
  }
  render();
}

const poll = startPolling(refresh, () => {
  if (!state) paint(app, '<p class="muted center">Connecting…</p>');
});

// ---------- rendering ----------

function render() {
  if (!state) return;
  const { you, phase } = state;
  if (!you) return renderForm('join', joinHtml());
  if (phase === 'lobby' && (editing || !you.entry)) return renderForm('entry', entryHtml(you));
  app.dataset.form = '';
  if (phase === 'lobby') return paint(app, frame(lobbyHtml(you)));
  if (phase === 'leaderboard') return paint(app, frame(finalHtml()));
  paint(app, frame(roundHtml()));
}

// Forms are drawn once and then left alone while polling, so typing isn't interrupted.
function renderForm(name, html) {
  if (app.dataset.form === name) return;
  app.dataset.form = name;
  paint(app, html);
  if (name === 'entry') updateCounters();
  app.querySelector('input, textarea')?.focus({ preventScroll: true });
}

function frame(body) {
  const { you } = state;
  const late = you.late ? '<p class="note">You joined after the start, so you can vote but you don’t have a round.</p>' : '';
  return `${body}${late}<footer class="whoami">Playing as <strong>${esc(you.name)}</strong></footer>`;
}

function joinHtml() {
  const started = state.phase !== 'lobby';
  return `
    <header class="hero"><h1>Two Truths<br>and a Lie</h1></header>
    ${notice ? `<p class="note">${esc(notice)}</p>` : ''}
    ${started ? '<p class="note">The game has already started. You can still join and vote.</p>' : ''}
    <form id="join-form" class="card">
      <label for="name">Your name</label>
      <input id="name" name="name" maxlength="30" autocomplete="given-name" required placeholder="e.g. Sam">
      <button class="btn primary" type="submit">Join the game</button>
    </form>`;
}

function entryHtml(you) {
  const entry = you.entry ?? { statements: ['', '', ''], lieIndex: null };
  const fields = [0, 1, 2]
    .map(
      (i) => `
      <div class="field">
        <label for="s${i}">Statement ${LETTERS[i]}</label>
        <textarea id="s${i}" name="s${i}" maxlength="${MAX_LEN}" rows="2" required>${esc(entry.statements[i])}</textarea>
        <div class="field-foot">
          <label class="lie-pick"><input type="radio" name="lie" value="${i}" aria-label="Statement ${LETTERS[i]} is the lie" ${entry.lieIndex === i ? 'checked' : ''} required> This one is the lie</label>
          <span class="counter" data-for="s${i}"></span>
        </div>
      </div>`,
    )
    .join('');
  return `
    <header><h1>Hi ${esc(you.name)}!</h1>
    <p class="lead">Write two true things about yourself and one lie. The order gets shuffled, so put them in any order.</p></header>
    <form id="entry-form" class="card">
      ${fields}
      <button class="btn primary" type="submit">Save my entry</button>
      ${you.entry ? '<button class="btn" type="button" data-action="cancel-edit">Cancel</button>' : ''}
    </form>`;
}

function lobbyHtml(you) {
  const { statements, lieIndex } = you.entry;
  return `
    <header><h1>You’re in!</h1><p class="lead">Waiting for the host to start the game…</p></header>
    <section class="card">
      <h2>Your entry</h2>
      <ol class="statements">${statements
        .map(
          (t, i) => `<li><div class="statement ${i === lieIndex ? 'lie' : ''}"><span class="letter">${LETTERS[i]}</span>
          <span class="text">${esc(t)}</span>${i === lieIndex ? '<span class="tag">Lie</span>' : ''}</div></li>`,
        )
        .join('')}</ol>
      <button class="btn" type="button" data-action="edit">Edit my entry</button>
    </section>
    <p class="muted center">Only you can see which one is your lie.</p>`;
}

function roundHtml() {
  const round = state.round;
  const you = state.you;
  if (!round) return '<p class="muted center">Waiting for the host…</p>';
  if (selectedFor !== round.subject.id) {
    selected = null;
    selectedFor = round.subject.id;
  }

  const head = `<header class="round-head">
    <p class="eyebrow">Person ${round.number} of ${round.total}</p>
    <h1>${round.isYou ? 'Your turn!' : `${esc(round.subject.name)}’s statements`}</h1></header>`;

  if (round.status === 'skipped') {
    return `${head}<p class="note">This round was skipped. Waiting for the host…</p>`;
  }

  if (round.status === 'revealed') {
    let verdict = '';
    const { liePos, tally } = round.result;
    if (round.isYou) {
      const fooled = tally.reduce((n, list, i) => (i === liePos ? n : n + list.length), 0);
      verdict = `<p class="verdict-banner ${fooled ? 'good' : ''}">You fooled ${fooled === 1 ? '1 person' : `${fooled} people`}!</p>`;
    } else if (round.myVote === liePos) {
      verdict = '<p class="verdict-banner good">You spotted the lie! +1</p>';
    } else if (round.myVote !== null) {
      verdict = `<p class="verdict-banner bad">${esc(round.subject.name)} fooled you!</p>`;
    } else {
      verdict = '<p class="verdict-banner">You didn’t vote on this one.</p>';
    }
    return `${head}${verdict}${resultHtml(round, you.id)}<p class="muted center">Waiting for the host…</p>`;
  }

  if (round.isYou) {
    const msg = round.status === 'voting' ? 'Everyone is voting on your statements…' : 'Keep a straight face!';
    return `${head}${statementsHtml(round.statements)}<p class="note">${msg}</p>`;
  }

  if (round.status === 'showing') {
    return `${head}${statementsHtml(round.statements)}<p class="note">Voting opens soon. Which one is the lie?</p>`;
  }

  // voting
  if (round.myVote !== null) {
    return `${head}${statementsHtml(round.statements, { mine: round.myVote })}
      <p class="note pulse">Vote locked in. Waiting for the reveal…</p>`;
  }
  return `${head}<p class="lead">Tap the one you think is the lie.</p>
    ${statementsHtml(round.statements, { selectable: true, selected })}
    <button class="btn primary" type="button" data-action="vote" ${selected === null || busy ? 'disabled' : ''}>
      ${selected === null ? 'Pick a statement' : `Lock in ${LETTERS[selected]}`}</button>`;
}

function finalHtml() {
  const me = state.leaderboard?.find((r) => r.id === state.you.id);
  return `<header><h1>Final scores</h1>
    ${me ? `<p class="lead">You finished ${ordinal(me.rank)} with ${plural(me.score, 'point')}.</p>` : ''}</header>
    ${leaderboardHtml(state.leaderboard, state.you.id)}
    <p class="muted center">+1 for each lie you spotted, +1 for each person you fooled.</p>`;
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

function updateCounters() {
  app.querySelectorAll('.counter').forEach((el) => {
    const len = app.querySelector(`#${el.dataset.for}`).value.length;
    el.textContent = `${len}/${MAX_LEN}`;
    el.classList.toggle('near', len > MAX_LEN - 20);
  });
}

// ---------- actions ----------

async function run(fn) {
  if (busy) return;
  busy = true;
  app.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (err) {
    toast(err.message);
  } finally {
    busy = false;
    app.querySelectorAll('button').forEach((b) => (b.disabled = false)); // forms aren't repainted
    app.dataset.html = ''; // force a repaint so other screens redraw their button states
    await poll();
  }
}

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'join-form') {
    run(async () => {
      const { playerId, gameId } = await api('/api/join', { method: 'POST', body: { name: form.elements.name.value } });
      save({ playerId, gameId });
      notice = '';
      app.dataset.form = '';
    });
  }
  if (form.id === 'entry-form') {
    const statements = [0, 1, 2].map((i) => form.elements[`s${i}`].value);
    const checked = form.querySelector('input[name="lie"]:checked');
    run(async () => {
      await api('/api/entry', {
        method: 'PUT',
        body: { playerId: saved.playerId, statements, lieIndex: checked ? Number(checked.value) : null },
      });
      editing = false;
      app.dataset.form = '';
      toast('Entry saved', 'ok');
    });
  }
});

app.addEventListener('input', (e) => {
  if (e.target.matches('textarea')) updateCounters();
});

app.addEventListener('click', (e) => {
  const choice = e.target.closest('[data-choice]');
  if (choice && !busy) {
    selected = Number(choice.dataset.choice);
    render();
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'edit') {
    editing = true;
    render();
  } else if (action === 'cancel-edit') {
    editing = false;
    app.dataset.form = '';
    render();
  } else if (action === 'vote' && selected !== null) {
    const subjectId = state.round.subject.id;
    run(() => api('/api/vote', { method: 'POST', body: { playerId: saved.playerId, subjectId, choice: selected } }));
  }
});
