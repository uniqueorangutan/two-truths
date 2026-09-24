// Player poll: everything one player's screen needs. Never includes the lie before reveal.
import { store, getGame, getPlayer, voteKey } from '../lib/store.js';
import { publicRound, hasEntry } from '../lib/game.js';
import { json } from '../lib/http.js';

export default async (req) => {
  const playerId = new URL(req.url).searchParams.get('playerId');
  const s = store();
  const [game, player] = await Promise.all([getGame(s), getPlayer(playerId, s)]);
  const you = player && player.gameId === game.gameId ? player : null;
  const round = publicRound(game);

  let myVote = null;
  if (you && round && round.subject.id !== you.id && ['voting', 'revealed'].includes(round.status)) {
    const vote = await s.get(voteKey(round.subject.id, you.id), { type: 'json' });
    myVote = vote?.choice ?? null;
  }

  return json({
    gameId: game.gameId,
    phase: game.phase,
    you: you && {
      id: you.id,
      name: you.name,
      late: you.late,
      entry: hasEntry(you) ? { statements: you.statements, lieIndex: you.lieIndex } : null,
      inGame: game.order.some((o) => o.id === you.id),
    },
    round: round && { ...round, isYou: round.subject.id === you?.id, myVote },
    leaderboard: game.phase === 'leaderboard' ? game.leaderboard : null,
  });
};

export const config = { path: '/api/state', method: 'GET' };
