// The rules of "the bus". No DOM here, so `node --test` can run them.
//
// The drawing shows one side of the bus: 14 rows of two seats, a window seat
// (the back row in the drawing) and an aisle seat (the front row), with
// standing room in the aisle. The other side of the aisle is out of view,
// so nobody there can be a neighbour.
//
// Every function takes the time `now` in milliseconds, and the ride keeps its
// own random number generator, so tests can replay a ride exactly.
//
// A plain script, not a module, so the page also works when opened straight
// from the folder. It puts everything on `BusRules`.

(() => {
  const ROWS = 14;
  const SEATS = ROWS * 2;            // 28 seats, and room for 28 riders
  const LANE = { window: 0, aisle: 1, standing: 2 };

  const MAX_BOARD = 5;               // at most 5 people board per stop
  const NEW_PER_STOP = 2;            // two fake riders join the line at each stop
  const SIT_AFTER = 3000;            // stand still this long next to a free seat to sit
  const MIX_EVERY = 10000;           // at most one mix line every 10 s, for the whole bus
  const ACT_MIN = 60000;             // fake riders act every 1 to 2 minutes
  const ACT_MAX = 120000;

  // The four circles on the route map: where you get on, then three stops to
  // where you get off. Legs are the times between them. These are the
  // defaults; a ride can be given its own (createRide's stops and legs).
  const STOPS = ["Plum Lane", "the Market", "Old Bridge", "the End of the Line"];   // texts.js has them in every language
  const LEGS = [45000, 110000, 105000];
  const FIRST_STOP_AT = 4000;

  // Walking. Fake riders get on at the front door (row 0) and walk to their
  // seat, one row per STEP. Before their stop they stand up and walk back to
  // the door. Now and then one changes seats.
  const STEP = 700;
  const LEAVE_BEFORE = 12000;        // stand up this long before your stop
  const CHANGE_SEAT = 0.2;           // chance, each time a fake rider acts, of changing seats
  const DOOR = 0;

  // Every text is in texts.js, in each language (ride.lang). Under node,
  // load it first: require("./texts.js").
  const TEXT = globalThis.BusTexts || (typeof require === "function" && (require("./texts.js"), globalThis.BusTexts));
  const textOf = lang => TEXT[lang] || TEXT.en;
  // A rider's name in a language ("Lemon", "Citron"…), and in the lines with an
  // invisible mark first, so the game knows which words are names to colour.
  const MARK = "\u200b";
  const nameIn = (name, lang) => textOf(lang).names?.[name] ?? name[0] + name.slice(1).toLowerCase();
  const who = (rider, lang) => MARK + nameIn(rider.name, lang);
  const yourAction = (action, lang) => textOf(lang).yours[action];
  // In English, for the tests and older code.
  const ACTIONS = TEXT.en.actions, YOUR_ACTIONS = TEXT.en.yours, MIXES = TEXT.en.mixes;
  // One action per rider for the whole ride, in this order (the mixes' keys use it).
  const ORDER = Object.keys(ACTIONS);

  const NAMES = [
    "COOKIE", "TIGER", "FIG", "MOTH", "PLUM", "BISCUIT", "OTTER", "PEBBLE", "MANGO", "WREN",
    "TOFU", "BEAN", "COMET", "MOSS", "PICKLE", "SPROUT", "NOODLE", "HAZEL", "BUTTON", "CLOVER",
    "MUFFIN", "PEPPER", "DAISY", "FERN", "GINGER", "HONEY", "JUNIPER", "KIWI", "LEMON", "MAPLE",
    "NUTMEG", "OLIVE", "PEANUT", "QUINCE", "RADISH", "SAGE", "TURNIP", "WAFFLE", "YAM", "ACORN",
    "BAGEL", "CRUMB", "DUMPLING", "EEL", "FLUFF", "GOOSE", "HERON", "IGLOO", "JELLY", "KOALA",
    "LLAMA", "MITTEN", "NEWT", "ONION", "POPPY", "RAVEN", "SARDINE", "TOAST", "WALNUT", "ZEBRA",
  ];
  // You are the only blue one on the bus; everyone else is brown or orange.
  const YOUR_COLOUR = "blue";
  const COLOURS = ["brown", "orange"];

  const pick = (ride, list) => list[Math.floor(ride.rng() * list.length)];
  const between = (ride, lo, hi) => lo + ride.rng() * (hi - lo);

  function newRider(ride, fake) {
    const free = NAMES.filter(n => !ride.usedNames.has(n));
    const name = free.length ? pick(ride, free) : `RIDER ${ride.riders.length + 1}`;
    ride.usedNames.add(name);
    const rider = {
      id: ride.riders.length,
      name,
      action: pick(ride, ORDER),
      colour: fake ? pick(ride, COLOURS) : YOUR_COLOUR,
      fake,
      where: "queue",           // "queue", "bus" or "gone"
      row: 0,
      lane: LANE.standing,
      leavesAt: STOPS.length - 1,
      nextActAt: Infinity,
      target: null,             // while walking: { row, lane } of a seat, or { row: DOOR, exit: true }
      nextStepAt: Infinity,
      stillSince: 0,
    };
    ride.riders.push(rider);
    return rider;
  }

  const onBus = ride => ride.riders.filter(r => r.where === "bus");
  const you = ride => ride.riders[ride.you];

  // Taken: someone sits there, or someone is walking to it.
  function seatTaken(ride, row, lane) {
    return ride.riders.some(r => r.where === "bus" &&
      ((r.row === row && r.lane === lane) || (r.target && r.target.row === row && r.target.lane === lane)));
  }

  // Send a rider walking to a seat or the door.
  function walkTo(ride, r, target, t) {
    r.lane = LANE.standing;
    r.target = target;
    r.nextStepAt = t + STEP;
  }

  function step(ride, r, t) {
    if (r.row !== r.target.row) r.row += Math.sign(r.target.row - r.row);
    if (r.row !== r.target.row) { r.nextStepAt = t + STEP; return; }
    r.nextStepAt = Infinity;
    if (r.target.exit) return;                   // wait by the door for the stop
    r.lane = r.target.lane;
    r.target = null;
  }

  function freeSeats(ride) {
    const out = [];
    for (let row = 0; row < ROWS; row++)
      for (const lane of [LANE.window, LANE.aisle])
        if (!seatTaken(ride, row, lane)) out.push({ row, lane });
    return out;
  }

  function sitSomewhere(ride, rider) {
    const seat = pick(ride, freeSeats(ride));
    rider.row = seat.row;
    rider.lane = seat.lane;
  }

  function say(ride, t, text, extra = {}) {
    const line = { t, text, row: null, kind: "stop", mine: false, ...extra };
    ride.story.push(line);
    return line;
  }

  const list = (names, T) =>
    names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${T.and} ${names.at(-1)}`;

  // A new ride. Options: rng (defaults to Math.random), now, aboard (how many
  // fake riders are already on the bus), ahead (fake riders in line before you),
  // fakes (false: no fake riders at all, only the real people added from outside).
  function createRide({ rng = Math.random, now = 0, aboard, ahead, fakes = true, stops = STOPS, legs = LEGS, lang = "en" } = {}) {
    const ride = {
      rng, fakes, stops, legs, lang, riders: [], usedNames: new Set(), queue: [], story: [],
      nextStop: 0, nextStopAt: now + FIRST_STOP_AT, lastMixAt: -Infinity, over: false, you: 0, readyFor: -1, mixed: new Set(),
    };
    ride.you = newRider(ride, false).id;

    if (!fakes) { ride.queue = [ride.you]; return ride; }
    aboard ??= 5 + Math.floor(rng() * 6);            // 5 to 10 riders already on board
    for (let i = 0; i < Math.min(aboard, SEATS); i++) {
      const r = newRider(ride, true);
      r.where = "bus";
      sitSomewhere(ride, r);
      r.leavesAt = 1 + Math.floor(rng() * (ride.stops.length - 1));
      r.nextActAt = now + between(ride, 5000, ACT_MAX);   // spread out the first ones
    }

    ahead ??= Math.floor(rng() * (NEW_PER_STOP + 1));  // 0 to 2 people before you
    const others = Array.from({ length: NEW_PER_STOP }, () => newRider(ride, true).id);
    ride.queue = [...others.slice(0, ahead), ride.you, ...others.slice(ahead)];
    return ride;
  }

  // Who `rider` is next to: beside first, then in front or behind, then on a
  // diagonal. Two lanes apart (window seat to standing) is too far.
  function neighbourOf(ride, rider) {
    let best = [], bestRank = Infinity;
    for (const other of onBus(ride)) {
      if (other === rider) continue;
      const dRow = Math.abs(other.row - rider.row);
      const dLane = Math.abs(other.lane - rider.lane);
      if (dRow > 1 || dLane > 1 || (dRow === 0 && dLane === 0)) continue;
      const rank = dRow === 0 ? 1 : dLane === 0 ? 2 : 3;
      if (rank < bestRank) { best = [other]; bestRank = rank; }
      else if (rank === bestRank) best.push(other);
    }
    return best.length ? pick(ride, best) : null;
  }

  function actionLine(rider, neighbour, lang) {
    const T = textOf(lang);
    return `${who(rider, lang)} ${T.actions[rider.action].replace("{who}", neighbour ? who(neighbour, lang) : T.nobody)}`;
  }

  function mixLine(actor, other, lang) {
    const a = ORDER.indexOf(actor.action), b = ORDER.indexOf(other.action);
    const [first, second] = a <= b ? [actor, other] : [other, actor];
    return textOf(lang).mixes[`${first.action}+${second.action}`]
      .replaceAll("{A}", who(first, lang)).replaceAll("{B}", who(second, lang));
  }
  // A line in every language, said in the ride's: what you do goes out to the
  // others, who read it in theirs.
  const inAll = (ride, make) => {
    const texts = Object.fromEntries(Object.keys(TEXT).map(l => [l, make(l)]));
    return { text: texts[ride.lang] || texts.en, texts };
  };

  // You press your action. Returns the new story lines (one or two).
  function act(ride, now) {
    const me = you(ride);
    if (me.where !== "bus" || ride.over) return [];
    const other = neighbourOf(ride, me);
    const did = inAll(ride, l => actionLine(me, other, l));
    const lines = [say(ride, now, did.text, { row: me.row, kind: "act", mine: true, texts: did.texts })];
    // A mix happens once per pair of people, and at most once every 10 s.
    const pair = other && [me.id, other.id].sort((a, b) => a - b).join("+");
    if (other && !ride.mixed.has(pair) && now - ride.lastMixAt >= MIX_EVERY) {
      ride.lastMixAt = now;
      ride.mixed.add(pair);
      const mix = inAll(ride, l => mixLine(me, other, l));
      lines.push(say(ride, now, mix.text, { row: me.row, kind: "mix", mine: true, texts: mix.texts }));
    }
    return lines;
  }

  // You walk one row towards the front (-1) or the back (+1). Sitting down
  // happens by itself, in tick(), after SIT_AFTER ms standing still.
  function move(ride, dir, now) {
    const me = you(ride);
    if (me.where !== "bus" || ride.over) return;
    me.lane = LANE.standing;                     // moving always stands you up
    me.row = Math.max(0, Math.min(ROWS - 1, me.row + dir));
    me.stillSince = now;
  }

  // The free seat in your row, window seat first.
  function seatHere(ride) {
    const me = you(ride);
    for (const lane of [LANE.window, LANE.aisle])
      if (!seatTaken(ride, me.row, lane)) return lane;
    return null;
  }

  function arrive(ride, t) {
    const k = ride.nextStop;
    const last = k === ride.stops.length - 1;
    const T = textOf(ride.lang);
    say(ride, t, T.stop(ride.stops[k]), { heading: true, stop: true });

    if (last) {
      for (const r of ride.riders) if (r.where === "bus") { r.where = "gone"; r.target = null; }
      ride.over = true;
      ride.nextStopAt = Infinity;
      const name = who(you(ride), ride.lang);
      say(ride, t, ride.fakes ? T.endAll(name) : T.endHere(name), { heading: ride.fakes });
      return;
    }

    const off = onBus(ride).filter(r => r.fake && r.leavesAt <= k);
    for (const r of off) { r.where = "gone"; r.target = null; }
    if (off.length) say(ride, t, T.off(list(off.map(r => who(r, ride.lang)), T), off.length));

    if (ride.fakes) for (let i = 0; i < NEW_PER_STOP; i++) ride.queue.push(newRider(ride, true).id);

    // Real people only: everyone in the line gets on, as long as there are seats.
    // Someone who came late waits at the stop for a later one (boardAt).
    const room = SEATS - onBus(ride).length;
    const boarding = ride.queue.filter(id => (ride.riders[id].boardAt ?? 0) <= k)
      .slice(0, Math.min(ride.fakes ? MAX_BOARD : SEATS, room));
    ride.queue = ride.queue.filter(id => !boarding.includes(id));
    for (const id of boarding) {
      const r = ride.riders[id];
      r.where = "bus";
      if (r.fake) {
        r.row = DOOR;
        walkTo(ride, r, pick(ride, freeSeats(ride)), t);
        r.leavesAt = k + 1 + Math.floor(ride.rng() * (ride.stops.length - 1 - k));
        r.nextActAt = t + between(ride, ACT_MIN, ACT_MAX);
      } else {
        r.row = 0;                 // you get on at the front and stand
        r.lane = LANE.standing;
        r.stillSince = t;
      }
    }
    if (boarding.length) say(ride, t, T.on(list(boarding.map(id => who(ride.riders[id], ride.lang)), T), boarding.length));

    const place = ride.queue.indexOf(ride.you);
    if (place >= 0 && (you(ride).boardAt ?? 0) <= k) {
      say(ride, t, T.wait(room - boarding.length > 0, who(you(ride), ride.lang), place + 1));
    }

    ride.nextStop++;
    ride.nextStopAt = t + ride.legs[k];
  }

  // A little before a stop, whoever gets off there stands up and walks to the door.
  function getReady(ride, t) {
    const k = ride.nextStop;
    ride.readyFor = k;
    for (const r of onBus(ride))
      if (r.fake && r.leavesAt <= k) walkTo(ride, r, { row: DOOR, exit: true }, t + between(ride, 0, 2500));
  }

  // Sometimes a fake rider moves to a free seat a few rows away.
  function maybeChangeSeat(ride, r, t) {
    if (r.target || ride.rng() >= CHANGE_SEAT) return;
    const near = freeSeats(ride).filter(s => Math.abs(s.row - r.row) <= 3 && s.row !== r.row);
    if (near.length) walkTo(ride, r, pick(ride, near), t);
  }

  // Moves the ride forward to `now`: stops, fake riders' actions, and you
  // sitting down. Events happen in time order. Returns the new story lines.
  function tick(ride, now) {
    const start = ride.story.length;
    for (;;) {
      let t = ride.nextStopAt, next = () => arrive(ride, t);

      if (ride.readyFor !== ride.nextStop && ride.nextStopAt - LEAVE_BEFORE < t) {
        t = ride.nextStopAt - LEAVE_BEFORE;
        next = () => getReady(ride, t);
      }

      const me = you(ride);
      if (me.where === "bus" && me.lane === LANE.standing && seatHere(ride) !== null) {
        const sitAt = me.stillSince + SIT_AFTER;
        if (sitAt < t) { t = sitAt; next = () => { me.lane = seatHere(ride); }; }
      }
      for (const r of onBus(ride)) {
        if (r.fake && r.nextActAt < t) {
          t = r.nextActAt;
          next = () => {
            say(ride, t, actionLine(r, neighbourOf(ride, r), ride.lang), { row: r.row, kind: "act" });
            r.nextActAt = t + between(ride, ACT_MIN, ACT_MAX);
            if (r.leavesAt > ride.nextStop || ride.readyFor !== ride.nextStop) maybeChangeSeat(ride, r, t);
          };
        }
        if (r.target && r.nextStepAt < t) {
          t = r.nextStepAt;
          next = () => step(ride, r, t);
        }
      }
      if (t > now) break;
      next();
    }
    return ride.story.slice(start);
  }

  // Where the bus is on the route: stop index plus how far along the next leg (0 to 1).
  function progress(ride, now) {
    if (ride.over) return ride.stops.length - 1;
    const k = ride.nextStop;
    if (k === 0) return 0;
    const leg = ride.legs[k - 1];
    return k - 1 + Math.min(1, Math.max(0, 1 - (ride.nextStopAt - now) / leg));
  }

  globalThis.BusRules = {
    ROWS, SEATS, LANE, STEP, LEAVE_BEFORE, DOOR, MAX_BOARD, NEW_PER_STOP, SIT_AFTER, MIX_EVERY, ACT_MIN, ACT_MAX, STOPS, LEGS, FIRST_STOP_AT, newRider, ACTIONS, YOUR_ACTIONS, MIXES, TEXT, yourAction, MARK, nameIn, who, NAMES, COLOURS, YOUR_COLOUR, onBus, you, seatTaken, createRide, neighbourOf, actionLine, mixLine, act, move, seatHere, tick, progress,
  };
})();
