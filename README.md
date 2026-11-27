# 3steps 2gether

A bus ride shared with strangers.

You wait at a bus stop and get your travel licence, which gives you one action for the ride: grab a bar, follow raindrops, start an aura battle, clip your nails… When the bus comes, you get on with the others. Nobody chats and nobody likes anything. You just ride side by side, see what the others are doing, and do your one thing. When your action meets someone else's, the window writes down the small moment you shared.

**[Play it online](https://sarahbg30.github.io/md1-copresence-creative-coding/)**

## Context

Made for the course *Creative Coding & Future Web* (Master Media Design, HEAD–Genève, MD1 2026–27). The brief was ambient co-presence on the web: being on the same site at the same time and noticing each other, without the usual chats, clicks and likes.

A bus is a place where we do exactly that. We share a small space with strangers and see them out of the corner of our eye, but we rarely speak. *3steps 2gether* turns that quiet side-by-side feeling into a website: you are present, you see the others, and your one small action can meet theirs.

## How to play

1. **At the bus stop**, your travel licence shows your name and your assigned action. Your own name floats above you as "?".
2. **When the bus arrives**, you get on. Your name is in blue; the other riders' names float above their heads.
3. **Arrow keys** (or the ‹ › buttons on a phone held sideways) walk you along the bus. Stand still next to a free seat to sit down.
4. **The button under your window** does your action. Your window tells you what the people around you are doing.
5. The bus calls at four stops: Plum Lane, the Market, Old Bridge and the End of the Line.

Add `?speed=40` to the address to make the ride go 40 times faster, for testing.

For now, the other riders are simulated in your browser: there is no server, so each visitor rides their own bus.

## Folders

```
3steps2gether-11-27-2026/
  code/              the website
    index.html       the page
    sketch.js        the game, drawn with p5.js
    rules.js         the rules: seats, stops, actions and what happens when two actions meet
    dreamcore-assets.js / dreamcore-filter.js   the dreamcore filter on the drawings
  resized-assets/    the drawings, cut to their edges
    bus-stop/        shelter, ground, people waiting
    bus-pass/        the travel licence and its birds
    bus-ride/        the bus, seats, driver and riders
    background-assets/   road, clouds, yellow bird
    positions.js     where each drawing sits on the scene
  logbook/           research and process: notes, texts, images
```

### Run it on your computer

The filter reads the drawings' pixels, so the page has to be opened through a small local server, not by double-clicking it. From the repo folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/3steps2gether-11-27-2026/code/

## Credits

- **Drawings, concept and design:** sarahbg30
- **[p5.js](https://p5js.org/)** 1.11.1, for drawing the game (LGPL)
- **[Gaegu](https://fonts.google.com/specimen/Gaegu)** by JIKJI SOFT and **[Courier Prime](https://fonts.google.com/specimen/Courier+Prime)** by Alan Dague-Greene, from Google Fonts (SIL Open Font License)
- **[gifenc](https://github.com/mattdesl/gifenc)** by Matt DesLauriers, for the colour palette of the filter (MIT)
- Code written with help from Claude Code (Anthropic)
- Course: *Creative Coding & Future Web*, HEAD–Genève. Professor: Amaury Hamon. Assistants: Pablo Bellon, Sarah Meylan

## Team

- sarahbg30
