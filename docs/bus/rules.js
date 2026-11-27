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

  // The four circles on the route. Legs are as long as the gaps between them.
  const STOPS = ["Plum Lane", "the Market", "Old Bridge", "the End of the Line"];
  const LEGS = [45000, 110000, 105000];
  const FIRST_STOP_AT = 4000;

  // Walking. Fake riders get on at the front door (row 0) and walk to their
  // seat, one row per STEP. Before their stop they stand up and walk back to
  // the door. Now and then one changes seats.
  const STEP = 700;
  const LEAVE_BEFORE = 12000;        // stand up this long before your stop
  const CHANGE_SEAT = 0.2;           // chance, each time a fake rider acts, of changing seats
  const DOOR = 0;

  // One action per rider for the whole ride. {who} is their neighbour.
  const ACTIONS = {
    sun: "contemplates the sun",
    rain: "follows the raindrops with their fingers",
    read: "pretends to read",
    think: "thinks very hard",
    bar: "couldn't grab the bar",
    wave: "waves at {who}",
    photo: "tries to take a picture of {who}",
    aura: "starts an aura battle with {who}",
    nails: "clips their nails",
  };
  // The same actions said to you, for your button.
  const YOUR_ACTIONS = {
    sun: "contemplate the sun",
    rain: "follow the raindrops with your fingers",
    read: "pretend to read",
    think: "think very hard",
    bar: "try to grab the bar",
    wave: "wave",
    photo: "try to take a picture",
    aura: "start an aura battle",
    nails: "clip your nails",
  };
  const ORDER = Object.keys(ACTIONS);

  // One hand-written line for every pair of actions. The key lists the two
  // actions in the order above; {A} has the first action, {B} the second.
  // For a pair of the same action, {A} is the one who just acted.
  const MIXES = {
    "sun+sun": "{A} and {B} close their eyes in the same patch of sun",
    "sun+rain": "{B} draws a raindrop on the glass, right where {A} was looking at the sun",
    "sun+read": "{B}'s pages light up while {A} squints at the sun",
    "sun+think": "{A} squints at the sun, {B} squints at a thought",
    "sun+bar": "{B} sways into {A}'s sunbeam and stays there",
    "sun+wave": "{B} waves at {A}, who is too busy with the sun to notice",
    "sun+photo": "{B} tries to take a picture of {A}, but the sun turns it all white",
    "rain+rain": "{A} and {B} race two raindrops down the glass",
    "rain+read": "{B} turns a page every time {A}'s raindrop reaches the bottom",
    "rain+think": "{A} traces a raindrop, {B} traces a thought",
    "rain+bar": "{B} misses the bar and catches {A}'s raindrop instead",
    "rain+wave": "{B} waves at {A}, who waves back with a wet finger",
    "rain+photo": "{B} tries to take a picture of {A}'s raindrop before it falls",
    "read+read": "{A} and {B} pretend to read the same page",
    "read+think": "{B} thinks very hard about what {A} is pretending to read",
    "read+bar": "{B} misses the bar and grabs {A}'s book instead",
    "read+wave": "{B} waves at {A}, who peeks over the book",
    "read+photo": "{B} tries to take a picture of {A}, who hides behind the book",
    "think+think": "{A} and {B} think very hard, side by side, about nothing at all",
    "think+bar": "{B} misses the bar and lands on {A}'s train of thought",
    "think+wave": "{B} waves at {A}, who is thinking too hard to wave back",
    "think+photo": "{B} tries to take a picture of {A}'s thinking face",
    "bar+bar": "{A} and {B} both miss the bar and hold on to each other",
    "bar+wave": "{B} waves at {A}, who waves back and nearly falls over",
    "bar+photo": "{B} tries to take a picture of {A} missing the bar, a second too late",
    "wave+wave": "{A} and {B} wave at each other until it gets awkward",
    "wave+photo": "{B} tries to take a picture of {A}, who waves at the camera",
    "photo+photo": "{A} and {B} try to take a picture of each other at the same time",
    "sun+aura": "{B} starts an aura battle with {A}, but {A}'s sun aura wins",
    "sun+nails": "{B} clips a nail into {A}'s patch of sun",
    "rain+aura": "{B} starts an aura battle with {A}, who answers with one raindrop",
    "rain+nails": "{B} clips their nails to the rhythm of {A}'s raindrops",
    "read+aura": "{B} starts an aura battle with {A}, who turns a page very slowly",
    "read+nails": "a clipped nail from {B} lands on {A}'s page",
    "think+aura": "{B} starts an aura battle with {A}, who loses by thinking too hard",
    "think+nails": "{A} thinks very hard about why {B} is clipping their nails here",
    "bar+aura": "{B} starts an aura battle with {A}, who loses it reaching for the bar",
    "bar+nails": "{A} misses the bar and grabs {B}'s nail clipper",
    "wave+aura": "{B} starts an aura battle with {A}, who just waves",
    "wave+nails": "{A} waves at {B}, who waves back with the nail clipper",
    "photo+aura": "{A} takes a picture of {B}'s aura, and it comes out blurry",
    "photo+nails": "{A} tries to take a picture of {B} clipping their nails",
    "aura+aura": "{A} and {B} have an aura battle, nobody blinks",
    "aura+nails": "{A} starts an aura battle with {B}, who keeps clipping",
    "nails+nails": "{A} and {B} clip their nails in rhythm",
  };

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

  const list = names =>
    names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const ordinal = n => n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th");

  // A new ride. Options: rng (defaults to Math.random), now, aboard (how many
  // fake riders are already on the bus), ahead (fake riders in line before you).
  function createRide({ rng = Math.random, now = 0, aboard, ahead } = {}) {
    const ride = {
      rng, riders: [], usedNames: new Set(), queue: [], story: [],
      nextStop: 0, nextStopAt: now + FIRST_STOP_AT, lastMixAt: -Infinity, over: false, you: 0, readyFor: -1, mixed: new Set(),
    };
    ride.you = newRider(ride, false).id;

    aboard ??= 5 + Math.floor(rng() * 6);            // 5 to 10 riders already on board
    for (let i = 0; i < Math.min(aboard, SEATS); i++) {
      const r = newRider(ride, true);
      r.where = "bus";
      sitSomewhere(ride, r);
      r.leavesAt = 1 + Math.floor(rng() * (STOPS.length - 1));
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

  function actionLine(rider, neighbour) {
    return `${rider.name} ${ACTIONS[rider.action].replace("{who}", neighbour ? neighbour.name : "nobody")}`;
  }

  function mixLine(actor, other) {
    const a = ORDER.indexOf(actor.action), b = ORDER.indexOf(other.action);
    const [first, second] = a <= b ? [actor, other] : [other, actor];
    return MIXES[`${first.action}+${second.action}`]
      .replace("{A}", first.name).replace("{B}", second.name);
  }

  // You press your action. Returns the new story lines (one or two).
  function act(ride, now) {
    const me = you(ride);
    if (me.where !== "bus" || ride.over) return [];
    const other = neighbourOf(ride, me);
    const lines = [say(ride, now, actionLine(me, other), { row: me.row, kind: "act", mine: true })];
    // A mix happens once per pair of people, and at most once every 10 s.
    const pair = other && [me.id, other.id].sort((a, b) => a - b).join("+");
    if (other && !ride.mixed.has(pair) && now - ride.lastMixAt >= MIX_EVERY) {
      ride.lastMixAt = now;
      ride.mixed.add(pair);
      lines.push(say(ride, now, mixLine(me, other), { row: me.row, kind: "mix", mine: true }));
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
    const last = k === STOPS.length - 1;
    say(ride, t, `The bus stops at ${STOPS[k]}.`);

    if (last) {
      for (const r of ride.riders) if (r.where === "bus") { r.where = "gone"; r.target = null; }
      ride.over = true;
      ride.nextStopAt = Infinity;
      say(ride, t, `End of the line. Everybody gets off, ${you(ride).name} too.`);
      return;
    }

    const off = onBus(ride).filter(r => r.fake && r.leavesAt <= k);
    for (const r of off) { r.where = "gone"; r.target = null; }
    if (off.length) say(ride, t, `${list(off.map(r => r.name))} ${off.length > 1 ? "get" : "gets"} off.`);

    for (let i = 0; i < NEW_PER_STOP; i++) ride.queue.push(newRider(ride, true).id);

    const room = SEATS - onBus(ride).length;
    const boarding = ride.queue.splice(0, Math.min(MAX_BOARD, room));
    for (const id of boarding) {
      const r = ride.riders[id];
      r.where = "bus";
      if (r.fake) {
        r.row = DOOR;
        walkTo(ride, r, pick(ride, freeSeats(ride)), t);
        r.leavesAt = k + 1 + Math.floor(ride.rng() * (STOPS.length - 1 - k));
        r.nextActAt = t + between(ride, ACT_MIN, ACT_MAX);
      } else {
        r.row = 0;                 // you get on at the front and stand
        r.lane = LANE.standing;
        r.stillSince = t;
      }
    }
    if (boarding.length) say(ride, t, `${list(boarding.map(id => ride.riders[id].name))} ${boarding.length > 1 ? "get" : "gets"} on.`);

    const place = ride.queue.indexOf(ride.you);
    if (place >= 0) {
      say(ride, t, `${room - boarding.length > 0 ? "No more room this time" : "The bus is full"}. ` +
        `${you(ride).name} keeps their place in the line, ${ordinal(place + 1)}.`);
    }

    ride.nextStop++;
    ride.nextStopAt = t + LEGS[k];
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
            say(ride, t, actionLine(r, neighbourOf(ride, r)), { row: r.row, kind: "act" });
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
    if (ride.over) return STOPS.length - 1;
    const k = ride.nextStop;
    if (k === 0) return 0;
    const leg = LEGS[k - 1];
    return k - 1 + Math.min(1, Math.max(0, 1 - (ride.nextStopAt - now) / leg));
  }

  globalThis.BusRules = {
    ROWS, SEATS, LANE, STEP, LEAVE_BEFORE, DOOR, MAX_BOARD, NEW_PER_STOP, SIT_AFTER, MIX_EVERY, ACT_MIN, ACT_MAX, STOPS, LEGS, FIRST_STOP_AT, newRider, ACTIONS, YOUR_ACTIONS, MIXES, NAMES, COLOURS, YOUR_COLOUR, onBus, you, seatTaken, createRide, neighbourOf, actionLine, mixLine, act, move, seatHere, tick, progress,
  };
})();
