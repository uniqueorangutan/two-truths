import { getStore } from '@netlify/blobs';

// Keys:
//   game                        game state, written only by host actions
//   player/{playerId}           one player's name and entry
//   name/{normalised name}      reservation so duplicate names are rejected atomically
//   vote/{subjectId}/{voterId}  one vote, write-once
export const store = () => getStore({ name: 'two-truths', consistency: 'strong' });

export const playerKey = (id) => `player/${id}`;
export const nameKey = (name) => `name/${encodeURIComponent(normaliseName(name))}`;
export const voteKey = (subjectId, voterId) => `vote/${subjectId}/${voterId}`;

export const normaliseName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export function newGame() {
  return {
    gameId: crypto.randomUUID(),
    phase: 'lobby', // lobby | playing | leaderboard
    order: [], // [{ id, name, statements (display order), liePos }] - liePos is server-only
    index: 0,
    rounds: {}, // { [subjectId]: { status: 'showing'|'voting'|'revealed'|'skipped', result? } }
    leaderboard: null,
  };
}

export async function getGame(s = store()) {
  const game = await s.get('game', { type: 'json' });
  if (game) return game;
  const fresh = newGame();
  // Two first requests could race here; onlyIfNew means both end up with the same game.
  await s.setJSON('game', fresh, { onlyIfNew: true });
  return (await s.get('game', { type: 'json' })) ?? fresh;
}

export const getPlayer = (id, s = store()) =>
  id ? s.get(playerKey(id), { type: 'json' }) : null;

export async function getAllPlayers(s = store()) {
  const { blobs } = await s.list({ prefix: 'player/' });
  const players = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' })));
  return players.filter(Boolean).sort((a, b) => a.joinedAt - b.joinedAt);
}

// Voter IDs come straight from the keys, so counting votes needs no reads.
export async function getVoterIds(subjectId, s = store()) {
  const prefix = `vote/${subjectId}/`;
  const { blobs } = await s.list({ prefix });
  return blobs.map((b) => b.key.slice(prefix.length));
}

export async function getVotes(subjectId, s = store()) {
  const ids = await getVoterIds(subjectId, s);
  const votes = await Promise.all(ids.map((id) => s.get(voteKey(subjectId, id), { type: 'json' })));
  return votes.filter(Boolean);
}
