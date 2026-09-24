// The only writer of the `game` key.
import { store, getGame, getAllPlayers, getVotes, newGame } from '../lib/store.js';
import { shuffle, hasEntry, current, buildResult, buildLeaderboard, revealOrder } from '../lib/game.js';
import { json, error, readBody, checkHostPin } from '../lib/http.js';

export default async (req) => {
  const denied = checkHostPin(req);
  if (denied) return denied;

  const { action } = await readBody(req);
  const s = store();
  const game = await getGame(s);
  const cur = current(game);
  const last = game.order.length - 1;

  switch (action) {
    case 'start': {
      if (game.phase !== 'lobby') return error('The game has already started.', 409);
      const players = (await getAllPlayers(s)).filter((p) => p.gameId === game.gameId);
      const ready = players.filter((p) => hasEntry(p) && !p.late);
      if (!ready.length) return error('Nobody has submitted an entry yet.', 409);
      game.order = shuffle(ready).map((p) => {
        const perm = shuffle([0, 1, 2]);
        return {
          id: p.id,
          name: p.name,
          statements: perm.map((i) => p.statements[i]),
          liePos: perm.indexOf(p.lieIndex),
        };
      });
      Object.assign(game, { phase: 'playing', index: 0, rounds: {}, leaderboard: null });
      break;
    }
    case 'next':
      if (!cur) return error('The game is not in progress.', 409);
      if (game.index >= last) return error('That was the last person. Show the leaderboard when ready.', 409);
      game.index++;
      break;
    case 'back':
      if (game.phase === 'leaderboard') game.phase = 'playing';
      else if (cur && game.index > 0) game.index--;
      else return error('Already at the first person.', 409);
      break;
    case 'skip':
      if (!cur) return error('The game is not in progress.', 409);
      if (cur.status === 'revealed') return error('This round has already been revealed.', 409);
      game.rounds[cur.entry.id] = { status: 'skipped' };
      if (game.index < last) game.index++;
      break;
    case 'openVoting':
      if (!cur) return error('The game is not in progress.', 409);
      if (cur.status === 'revealed') return error('This round has already been revealed.', 409);
      game.rounds[cur.entry.id] = { status: 'voting' };
      break;
    case 'reveal': {
      if (!cur) return error('The game is not in progress.', 409);
      if (cur.status === 'revealed') return error('Already revealed.', 409);
      const votes = await getVotes(cur.entry.id, s);
      game.rounds[cur.entry.id] = { status: 'revealed', result: buildResult(cur.entry, votes) };
      break;
    }
    case 'leaderboard': {
      if (game.phase !== 'playing') return error('Start the game first.', 409);
      const players = (await getAllPlayers(s)).filter((p) => p.gameId === game.gameId);
      game.leaderboard = buildLeaderboard(game, players);
      game.leaderboardStep = 0; // nothing revealed yet: the host reveals from last place up
      game.phase = 'leaderboard';
      break;
    }
    case 'revealNext': {
      if (game.phase !== 'leaderboard') return error('Show the leaderboard first.', 409);
      const steps = revealOrder(game.leaderboard).length;
      if ((game.leaderboardStep ?? steps) >= steps) return error('Everyone has been revealed.', 409);
      game.leaderboardStep++;
      break;
    }
    case 'reset': {
      // New game first, so any old player ID stops matching straight away.
      await s.setJSON('game', newGame());
      const { blobs } = await s.list();
      await Promise.all(blobs.filter((b) => b.key !== 'game').map((b) => s.delete(b.key)));
      return json({ ok: true });
    }
    default:
      return error('Unknown action.');
  }

  await s.setJSON('game', game);
  return json({ ok: true });
};

export const config = { path: '/api/host-action', method: 'POST' };
