# the bus

A bus ride written as a log. It looks shared, but everyone else on the bus is a fake rider: there is no server, and each browser tab has its own bus.

## Play it

The site is the `docs` folder. To put it online with GitHub Pages: Settings > Pages > Deploy from a branch > `main` and `/docs`.

Add `?speed=12` to the address to make all the waiting 12 times shorter.

## Try it on your computer

```bash
python3 -m http.server 3000 -d docs
```

Then open http://localhost:3000. Reloading keeps your ride, and a new tab is a new ride.

## Where to change things

| To change... | Edit |
| --- | --- |
| names, actions, mix lines | `docs/data.js` |
| time between stops, time on the bus, number of fake riders | top of `docs/client.js` |
| the rules | `docs/game.js` |
| the look | `docs/style.css` |
| the sky, road, bus, ticket, sign and shelter | `docs/images/` (the `-still.png` files are shown while the bus is stopped) |
| the pages | `docs/index.html`, `docs/client.js` |

## Test the rules

You need [Node](https://nodejs.org) (version 20 or newer). There is nothing to install.

```bash
npm test
```
