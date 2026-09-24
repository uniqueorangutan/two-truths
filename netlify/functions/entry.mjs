import { store, getGame, getPlayer, playerKey } from '../lib/store.js';
import { MAX_LEN } from '../lib/game.js';
import { json, error, readBody } from '../lib/http.js';

export default async (req) => {
  const { playerId, statements, lieIndex } = await readBody(req);
  const s = store();
  const [game, player] = await Promise.all([getGame(s), getPlayer(playerId, s)]);

  if (!player || player.gameId !== game.gameId) return error('We could not find you. Please join again.', 404);
  if (game.phase !== 'lobby') return error('The game has started, so entries are locked.', 409);
  if (player.late) return error('You joined after the start, so you can vote but not add a round.', 409);

  if (!Array.isArray(statements) || statements.length !== 3) return error('Please write three statements.');
  const clean = statements.map((t) => String(t ?? '').trim().replace(/\s+/g, ' '));
  if (clean.some((t) => !t)) return error('All three statements need some text.');
  if (clean.some((t) => t.length > MAX_LEN)) return error(`Each statement can be up to ${MAX_LEN} characters.`);
  if (![0, 1, 2].includes(lieIndex)) return error('Please mark which statement is the lie.');

  await s.setJSON(playerKey(player.id), { ...player, statements: clean, lieIndex });
  return json({ ok: true });
};

export const config = { path: '/api/entry', method: 'PUT' };
