import { store, getGame, getPlayer, voteKey } from '../lib/store.js';
import { current } from '../lib/game.js';
import { json, error, readBody } from '../lib/http.js';

export default async (req) => {
  const { playerId, subjectId, choice } = await readBody(req);
  const s = store();
  const [game, player] = await Promise.all([getGame(s), getPlayer(playerId, s)]);

  if (!player || player.gameId !== game.gameId) return error('We could not find you. Please join again.', 404);
  const cur = current(game);
  if (!cur || cur.entry.id !== subjectId) return error('That round is no longer active.', 409);
  if (cur.status !== 'voting') return error('Voting is not open right now.', 409);
  if (player.id === subjectId) return error("You can't vote on your own round.", 403);
  if (![0, 1, 2].includes(choice)) return error('Pick one of the three statements.');

  // One key per vote, write-once: simultaneous voters never overwrite each other.
  const { modified } = await s.setJSON(
    voteKey(subjectId, player.id),
    { voterId: player.id, name: player.name, choice, at: Date.now() },
    { onlyIfNew: true },
  );
  if (!modified) return error("You've already voted on this round.", 409);
  return json({ ok: true });
};

export const config = { path: '/api/vote', method: 'POST' };
