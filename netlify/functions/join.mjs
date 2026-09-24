import { store, getGame, nameKey, playerKey } from '../lib/store.js';
import { MAX_NAME_LEN } from '../lib/game.js';
import { json, error, readBody } from '../lib/http.js';

export default async (req) => {
  const body = await readBody(req);
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return error('Please enter your name.');
  if (name.length > MAX_NAME_LEN) return error(`Names can be up to ${MAX_NAME_LEN} characters.`);

  const s = store();
  const game = await getGame(s);
  const id = crypto.randomUUID();

  // Reserve the name first: onlyIfNew makes this atomic, so two people can't both claim it.
  const { modified } = await s.setJSON(nameKey(name), { id }, { onlyIfNew: true });
  if (!modified) return error('Someone has already joined with that name. Try adding an initial.', 409);

  await s.setJSON(playerKey(id), {
    id,
    gameId: game.gameId,
    name,
    joinedAt: Date.now(),
    late: game.phase !== 'lobby',
    statements: null,
    lieIndex: null,
  });
  return json({ playerId: id, gameId: game.gameId });
};

export const config = { path: '/api/join', method: 'POST' };
