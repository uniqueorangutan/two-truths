// Rehearsal helper: fake players that join, submit entries and vote through the real API.
//
//   npm run seed                      create 7 fake players with entries (local netlify dev)
//   npm run seed -- votes             fake players vote randomly on the current person
//   npm run seed -- --url <site url>  run either command against another URL instead
//
// Fake player IDs are kept in scripts/.seed-players.json (gitignored) so `votes` knows who they are.

import { readFile, writeFile } from 'node:fs/promises';

const FAKES = [
  { name: 'Alex', statements: ['I once met a Queen’s Guard off duty at a bus stop', 'I can juggle five balls', 'I have never seen Star Wars'], lie: 1 },
  { name: 'Priya', statements: ['I ran a half marathon in flip-flops', 'I speak three languages', 'I was on a TV quiz show as a kid'], lie: 0 },
  { name: 'Jordan', statements: ['I have a pet tortoise called Gerald', 'I’ve been to 30 countries', 'I’m allergic to apples'], lie: 2 },
  { name: 'Mei', statements: ['I used to play the bagpipes', 'I have climbed Kilimanjaro', 'I have a twin brother'], lie: 1 },
  { name: 'Tom', statements: ['I once ate 40 chicken nuggets in one sitting', 'I got lost in IKEA for two hours', 'I was born on a leap day'], lie: 2 },
  { name: 'Fatima', statements: ['I can solve a Rubik’s cube in under a minute', 'I’ve never broken a bone', 'I once sang backing vocals on a single'], lie: 2 },
  { name: 'Sam', statements: ['I’ve been struck by lightning', 'I hate the taste of chocolate', 'I learned to drive in a tractor'], lie: 0 },
];

const FILE = new URL('./.seed-players.json', import.meta.url);

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
const base = (urlFlag >= 0 ? args[urlFlag + 1] : 'http://localhost:8888').replace(/\/$/, '');
const command = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--url') ?? 'players';

async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    console.error(`Could not reach ${base}. Is \`netlify dev\` running?`);
    process.exit(1);
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function loadSaved() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'))[base] ?? [];
  } catch {
    return [];
  }
}

async function save(players) {
  let all = {};
  try {
    all = JSON.parse(await readFile(FILE, 'utf8'));
  } catch {}
  all[base] = players;
  await writeFile(FILE, JSON.stringify(all, null, 2) + '\n');
}

async function seedPlayers() {
  const saved = await loadSaved();
  const result = [];
  for (const fake of FAKES) {
    const known = saved.find((p) => p.name === fake.name);
    if (known) {
      const { data } = await api(`/api/state?playerId=${known.id}`);
      if (data.you) {
        console.log(`• ${fake.name} already exists`);
        result.push(known);
        continue;
      }
    }
    const join = await api('/api/join', 'POST', { name: fake.name });
    if (!join.ok) {
      console.log(`✗ ${fake.name}: ${join.data.error}`);
      continue;
    }
    const id = join.data.playerId;
    result.push({ id, name: fake.name });
    const entry = await api('/api/entry', 'PUT', { playerId: id, statements: fake.statements, lieIndex: fake.lie });
    console.log(entry.ok ? `✓ ${fake.name} joined with an entry` : `• ${fake.name} joined, no entry: ${entry.data.error}`);
  }
  await save(result);
  console.log(`\n${result.length} fake players ready at ${base}`);
}

async function castVotes() {
  const saved = await loadSaved();
  if (!saved.length) {
    console.error('No fake players found. Run `npm run seed` first.');
    process.exit(1);
  }
  const { data } = await api(`/api/state?playerId=${saved[0].id}`);
  if (!data.you) {
    console.error('The fake players no longer exist (the game was probably reset). Run `npm run seed` again.');
    process.exit(1);
  }
  const round = data.round;
  if (!round || round.status !== 'voting') {
    console.error('Voting isn’t open. Press “Open voting” on the host page first.');
    process.exit(1);
  }
  console.log(`Voting on ${round.subject.name}:`);
  for (const p of saved) {
    if (p.id === round.subject.id) {
      console.log(`• ${p.name} is on the spot, so doesn't vote`);
      continue;
    }
    const choice = Math.floor(Math.random() * 3);
    const res = await api('/api/vote', 'POST', { playerId: p.id, subjectId: round.subject.id, choice });
    console.log(res.ok ? `✓ ${p.name} voted ${'ABC'[choice]}` : `• ${p.name}: ${res.data.error}`);
  }
}

if (command === 'votes') await castVotes();
else if (command === 'players') await seedPlayers();
else {
  console.error(`Unknown command "${command}". Use no command to create players, or "votes".`);
  process.exit(1);
}
