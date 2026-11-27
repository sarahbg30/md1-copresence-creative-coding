import test from "node:test";
import assert from "node:assert/strict";
import "./rules.js";

const R = globalThis.BusRules;

// A small seeded random generator, so every ride replays the same way.
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// A ride where you are first in line and the bus has room.
function boarded(options = {}) {
  const ride = R.createRide({ rng: seeded(), aboard: 0, ahead: 0, ...options });
  R.tick(ride, R.FIRST_STOP_AT);
  return ride;
}

// Put a rider exactly where a test wants them.
function place(ride, rider, row, lane, action) {
  Object.assign(rider, { where: "bus", row, lane, target: null, nextStepAt: Infinity });
  if (action) rider.action = action;
  return rider;
}
const fakes = ride => ride.riders.filter(r => r.fake);

test("every pair of actions has its own mix line", () => {
  const keys = Object.keys(R.ACTIONS);
  for (const a of keys) for (const b of keys) {
    const [x, y] = keys.indexOf(a) <= keys.indexOf(b) ? [a, b] : [b, a];
    assert.ok(R.MIXES[`${x}+${y}`], `${x}+${y}`);
  }
  assert.equal(Object.keys(R.MIXES).length, 45);
});

test("the bus has 28 seats and starts with nobody on your seat", () => {
  const ride = R.createRide({ rng: seeded(3), aboard: 27 });
  const seats = new Set(R.onBus(ride).map(r => `${r.row}/${r.lane}`));
  assert.equal(seats.size, 27);
  assert.equal(R.SEATS, 28);
});

test("you get one action for the whole ride, from the list", () => {
  const ride = boarded();
  assert.ok(Object.keys(R.ACTIONS).includes(R.you(ride).action));
});

test("at most 5 people board per stop", () => {
  const ride = R.createRide({ rng: seeded(), aboard: 0, ahead: 2 });
  // Six extra people in line before the bus comes.
  for (let i = 0; i < 6; i++) {
    const id = ride.riders.length;
    ride.riders.push({ ...ride.riders[1], id, name: `X${i}`, where: "queue" });
    ride.queue.unshift(id);
  }
  R.tick(ride, R.FIRST_STOP_AT);
  assert.equal(R.onBus(ride).length, 5);
  assert.equal(ride.queue.length, 6 + 3 + 2 - 5);    // 6 extra, 3 waiting, 2 from the stop
});

test("when the bus is full you keep your place in the line", () => {
  const ride = R.createRide({ rng: seeded(), aboard: 27, ahead: 1 });
  for (const r of R.onBus(ride)) r.leavesAt = 2;     // nobody gets off at the first stop
  R.tick(ride, R.FIRST_STOP_AT);
  assert.equal(R.you(ride).where, "queue");
  assert.equal(ride.queue[0], ride.you);             // first in line now
  assert.match(ride.story.at(-1).text, /keeps their place in the line, 1st/);

  for (const r of R.onBus(ride)) r.leavesAt = 1;     // they all get off at the next stop
  R.tick(ride, R.FIRST_STOP_AT + R.LEGS[0]);
  assert.equal(R.you(ride).where, "bus");
});

test("two fake riders join the line at each stop", () => {
  const ride = boarded();
  assert.equal(fakes(ride).length, 2 + 2);           // two waiting with you, two from the stop
});

test("your action uses your neighbour, or nobody", () => {
  const ride = boarded();
  for (const r of fakes(ride)) r.where = "gone";
  const me = place(ride, R.you(ride), 5, R.LANE.window, "wave");
  assert.equal(R.act(ride, 10000)[0].text, `${me.name} waves at nobody`);

  const tiger = place(ride, fakes(ride)[0], 6, R.LANE.window, "sun");
  const lines = R.act(ride, 20000);
  assert.equal(lines[0].text, `${me.name} waves at ${tiger.name}`);
});

test("beside beats in front, which beats a diagonal", () => {
  const ride = boarded();
  const [a, b, c] = fakes(ride);
  const me = place(ride, R.you(ride), 5, R.LANE.window);
  place(ride, a, 6, R.LANE.aisle);                   // diagonal
  assert.equal(R.neighbourOf(ride, me), a);
  place(ride, b, 4, R.LANE.window);                  // behind
  assert.equal(R.neighbourOf(ride, me), b);
  place(ride, c, 5, R.LANE.aisle);                   // beside
  assert.equal(R.neighbourOf(ride, me), c);
});

test("two rows away or two lanes away is not a neighbour", () => {
  const ride = boarded();
  for (const r of fakes(ride)) r.where = "gone";
  const me = place(ride, R.you(ride), 5, R.LANE.standing);
  place(ride, fakes(ride)[0], 7, R.LANE.aisle);
  place(ride, fakes(ride)[1], 5, R.LANE.window);
  assert.equal(R.neighbourOf(ride, me), null);
});

test("acting next to someone writes a mix, at most one every 10 seconds", () => {
  const ride = boarded();
  for (const r of fakes(ride)) r.where = "gone";
  const me = place(ride, R.you(ride), 3, R.LANE.window, "read");
  const tiger = place(ride, fakes(ride)[0], 3, R.LANE.aisle, "photo");
  me.name = "COOKIE"; tiger.name = "TIGER";

  const first = R.act(ride, 10000);
  assert.equal(first.length, 2);
  assert.equal(first[1].text, "TIGER tries to take a picture of COOKIE, who hides behind the book");
  assert.equal(R.act(ride, 15000).length, 1);        // too soon

  const fig = place(ride, fakes(ride)[1], 3, R.LANE.aisle, "sun");
  tiger.where = "gone";
  assert.equal(R.act(ride, 20000).length, 2);        // 10 s later, someone new
});

test("an interaction between two people happens only once", () => {
  const ride = boarded();
  for (const r of fakes(ride)) r.where = "gone";
  place(ride, R.you(ride), 3, R.LANE.window, "read");
  place(ride, fakes(ride)[0], 3, R.LANE.aisle, "photo");
  assert.equal(R.act(ride, 10000).length, 2);
  assert.equal(R.act(ride, 30000).length, 1);
  assert.equal(R.act(ride, 90000).length, 1);
});

test("fake riders act every 1 to 2 minutes", () => {
  const ride = R.createRide({ rng: seeded(7), aboard: 1, ahead: 0 });
  const rider = R.onBus(ride)[0];
  rider.leavesAt = 3;
  const times = [];
  for (let t = 0; t < 400000; t += 1000)
    for (const line of R.tick(ride, t)) if (line.text.startsWith(rider.name + " ")) times.push(line.t);
  assert.ok(times.length >= 2);
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    assert.ok(gap >= R.ACT_MIN && gap <= R.ACT_MAX, `gap ${gap}`);
  }
});

test("you sit after 3 seconds still next to a free seat, window first", () => {
  const ride = boarded();
  for (const r of fakes(ride)) r.where = "gone";
  const me = R.you(ride);
  R.move(ride, +1, 10000);
  R.tick(ride, 12999);
  assert.equal(me.lane, R.LANE.standing);
  R.tick(ride, 13000);
  assert.equal(me.lane, R.LANE.window);

  R.move(ride, +1, 14000);                           // moving stands you up
  assert.equal(me.lane, R.LANE.standing);
  place(ride, fakes(ride)[0], me.row, R.LANE.window);
  R.tick(ride, 17000);
  assert.equal(me.lane, R.LANE.aisle);               // window seat taken: aisle
});

test("you stay standing when your row is full", () => {
  const ride = boarded();
  const me = R.you(ride);
  place(ride, fakes(ride)[0], 0, R.LANE.window);
  place(ride, fakes(ride)[1], 0, R.LANE.aisle);
  R.tick(ride, 30000);                               // before the next stop
  assert.equal(me.lane, R.LANE.standing);
});

test("the ride ends at the last stop and everybody gets off", () => {
  const ride = boarded();
  const end = R.FIRST_STOP_AT + R.LEGS.reduce((a, b) => a + b);
  R.tick(ride, end);
  assert.equal(ride.over, true);
  assert.equal(R.onBus(ride).length, 0);
  assert.match(ride.story.at(-1).text, /End of the line/);
});

test("new riders get on at the door and walk to their seat", () => {
  const ride = boarded();
  const walker = fakes(ride).find(r => r.where === "bus" && r.target);
  assert.ok(walker);
  assert.equal(walker.row, R.DOOR);
  assert.equal(walker.lane, R.LANE.standing);
  const seat = walker.target;
  R.tick(ride, R.FIRST_STOP_AT + R.STEP * (R.ROWS + 1));
  assert.equal(walker.row, seat.row);
  assert.equal(walker.lane, seat.lane);
});

test("nobody else sits on a seat someone is walking to", () => {
  const ride = boarded();
  const walker = fakes(ride).find(r => r.target);
  assert.ok(R.seatTaken(ride, walker.target.row, walker.target.lane));
});

test("riders walk to the door before their stop, and get off there", () => {
  const ride = R.createRide({ rng: seeded(5), aboard: 1, ahead: 0 });
  const rider = R.onBus(ride)[0];
  Object.assign(rider, { row: 9, lane: R.LANE.window, leavesAt: 1 });
  R.tick(ride, R.FIRST_STOP_AT + 100);
  const stop = ride.nextStopAt;
  R.tick(ride, stop - R.LEAVE_BEFORE - 1);
  assert.equal(rider.lane, R.LANE.window);           // still sitting
  R.tick(ride, stop - 1);
  assert.equal(rider.lane, R.LANE.standing);
  assert.equal(rider.row, R.DOOR);                   // waiting at the door
  R.tick(ride, stop);
  assert.equal(rider.where, "gone");
});

test("you are blue, and the only blue one on the bus", () => {
  const ride = R.createRide({ rng: seeded(9), aboard: 27 });
  assert.equal(R.you(ride).colour, "blue");
  for (const r of ride.riders) if (r.fake) assert.notEqual(r.colour, "blue");
});

test("every action is also said to you", () => {
  assert.deepEqual(Object.keys(R.YOUR_ACTIONS), Object.keys(R.ACTIONS));
});
