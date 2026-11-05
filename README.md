# the bus

A shared bus ride, written as a log. First prototype.

## Run it

You need [Node](https://nodejs.org) (version 20 or newer). There is nothing to install.

```bash
npm start
```

Then open http://localhost:3000. Each browser tab is one person, so open several tabs to test alone.

To test faster, with stops every 10 to 15 seconds and rides of 40 to 100 seconds:

```bash
npm run dev
```

To test with friends, connect to the same wifi and share the "On the same wifi" address printed in the terminal. Some school networks block this.

## Where to change things

| To change... | Edit |
| --- | --- |
| names, actions, mix lines | `data.js` |
| test speed, bus size | `SPEED=6 MAX_RIDERS=10 npm start` |
| time between stops, time on the bus | `server.js` |
| the rules | `game.js` |
| what "close" means, how seats are given | top of `game.js` |
| the look | `public/style.css` |
| the sky, road, bus, ticket, sign and shelter | `public/images/` (the `-still.png` files are shown while the bus is stopped) |
| the pages | `public/index.html`, `public/client.js` |

To let Claude write the mixes, replace `mixLine` in `game.js`. Keep the lines in `data.js` as the fallback. The API key must stay on the server, so never put it in `public/`.

## Test the rules

```bash
npm test
```
