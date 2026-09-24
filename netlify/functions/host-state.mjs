// Host poll. Like the player view, it never includes the lie before reveal.
import { store, getGame, getAllPlayers, getVoterIds } from '../lib/store.js';
import { publicRound, hasEntry } from '../lib/game.js';
import { json, checkHostPin } from '../lib/http.js';

export default async (req) => {
  const denied = checkHostPin(req);
  if (denied) return denied;

  const s = store();
  const game = await getGame(s);
  const players = (await getAllPlayers(s)).filter((p) => p.gameId === game.gameId);
  const round = publicRound(game);

  let votes = null;
  if (round) {
    const voted = new Set(await getVoterIds(round.subject.id, s));
    const eligible = players.filter((p) => p.id !== round.subject.id);
    votes = {
      count: eligible.filter((p) => voted.has(p.id)).length,
      eligible: eligible.length,
      notVoted: eligible.filter((p) => !voted.has(p.id)).map((p) => p.name),
    };
  }

  return json({
    gameId: game.gameId,
    phase: game.phase,
    players: players.map((p) => ({ id: p.id, name: p.name, submitted: hasEntry(p), late: p.late })),
    order: game.order.map((o, i) => ({
      name: o.name,
      status: game.rounds[o.id]?.status ?? 'showing',
      current: game.phase === 'playing' && i === game.index,
    })),
    round,
    votes,
    leaderboard: game.phase === 'leaderboard' ? game.leaderboard : null,
  });
};

export const config = { path: '/api/host-state', method: 'GET' };
