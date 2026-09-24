export const MAX_LEN = 150;
export const MAX_NAME_LEN = 30;

export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const hasEntry = (player) => Array.isArray(player?.statements) && player.statements.length === 3;

export function current(game) {
  if (game.phase !== 'playing' || !game.order.length) return null;
  const entry = game.order[game.index];
  return { entry, status: game.rounds[entry.id]?.status ?? 'showing', result: game.rounds[entry.id]?.result };
}

// What everyone may see about the current round. liePos is only included via result, after reveal.
export function publicRound(game) {
  const cur = current(game);
  if (!cur) return null;
  return {
    number: game.index + 1,
    total: game.order.length,
    subject: { id: cur.entry.id, name: cur.entry.name },
    statements: cur.entry.statements,
    status: cur.status,
    result: cur.status === 'revealed' ? cur.result : null,
  };
}

export function buildResult(entry, votes) {
  const tally = [[], [], []];
  for (const v of votes) {
    if (v.choice >= 0 && v.choice <= 2 && v.voterId !== entry.id) {
      tally[v.choice].push({ id: v.voterId, name: v.name });
    }
  }
  tally.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
  return { liePos: entry.liePos, tally };
}

// +1 per correct guess, +1 to the person on the spot per player fooled. Ties share a rank.
export function buildLeaderboard(game, players) {
  const rows = new Map(players.map((p) => [p.id, { id: p.id, name: p.name, correct: 0, fooled: 0 }]));
  for (const entry of game.order) {
    const round = game.rounds[entry.id];
    if (round?.status !== 'revealed' || !round.result) continue;
    const { liePos, tally } = round.result;
    tally.forEach((voters, pos) => {
      for (const v of voters) {
        if (pos === liePos) {
          if (rows.has(v.id)) rows.get(v.id).correct++;
        } else if (rows.has(entry.id)) {
          rows.get(entry.id).fooled++;
        }
      }
    });
  }
  const list = [...rows.values()].map((r) => ({ ...r, score: r.correct + r.fooled }));
  list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  for (const r of list) r.rank = 1 + list.filter((o) => o.score > r.score).length;
  return list;
}

// Ranks in reveal order: last place first, winner last. Tied players share a rank, so they reveal together.
export const revealOrder = (rows) => [...new Set(rows.map((r) => r.rank))].sort((a, b) => b - a);

// The leaderboard as far as the host has revealed it. Unrevealed rows carry no name or score,
// so nothing can be spotted early in the network traffic.
export function publicLeaderboard(game) {
  if (game.phase !== 'leaderboard' || !game.leaderboard) return null;
  const rows = game.leaderboard;
  const order = revealOrder(rows);
  const step = Math.min(game.leaderboardStep ?? order.length, order.length);
  const shown = new Set(order.slice(0, step));
  const latest = step ? order[step - 1] : null;
  return {
    step,
    steps: order.length,
    done: step === order.length,
    nextRank: step < order.length ? order[step] : null,
    rows: rows.map((r) => (shown.has(r.rank) ? { ...r, latest: r.rank === latest } : { hidden: true })),
  };
}
