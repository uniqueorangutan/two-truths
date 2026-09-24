# two-truths

Two Truths and a Lie for live team video calls. Plain HTML/CSS/JS, Netlify Functions and Netlify Blobs. One game at a time.

- **Players:** open the site's root URL, enter a name, write two truths and a lie.
- **Host:** open `/host.html` and enter the `HOST_PIN` set in Netlify. Play along from a second device using the normal player link.

## Running locally

```bash
npm install
netlify dev
```

The app runs at http://localhost:8888. `netlify dev` pulls `HOST_PIN` from the linked site. If it doesn't, put `HOST_PIN=...` in a `.env` file (gitignored).

## Rehearsing alone

With `netlify dev` running:

```bash
npm run seed            # 7 fake players join with entries
npm run seed -- votes   # while voting is open: fake players vote randomly
```

Join yourself on your phone, start the game from the host page, and run `npm run seed -- votes` each time you open voting. Add `--url https://your-site.netlify.app` to either command to run it against the live site, then press **Reset game** before the real call.

## How a game runs

1. **Lobby.** Players join and submit entries, which they can edit until the start. The host sees who has submitted.
2. **Start.** The running order is randomised and each person's statements are shuffled. Anyone without an entry, or who joins later, can vote but has no round.
3. **Each person.** Their statements appear, then the host opens voting and reveals, then moves to the next person. The host can reveal before everyone has voted, and can skip a person or go back.
4. **Leaderboard.** +1 for each lie you spot, and +1 to the person on the spot for each player they fool. Tied players share a position.

## Layout

```
public/              index.html (player), host.html, css/, js/
netlify/functions/   state, join, entry, vote (players); host-state, host-action (PIN required)
netlify/lib/         Blobs access, game logic, HTTP helpers
scripts/seed.mjs     rehearsal helper
```

Storage is one Blobs store with these keys:

- `game`: phase, running order and round statuses. Only host actions write it.
- `player/{id}`: one key per player.
- `vote/{subjectId}/{voterId}`: one write-once key per vote, so simultaneous votes never overwrite each other.
- `name/{name}`: reserves each name, so duplicates are rejected.

The lie is never sent to any browser, the host's included, until that round is revealed.
