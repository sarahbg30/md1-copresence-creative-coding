import test from 'node:test';
import assert from 'node:assert/strict';
import { BusGame, SEATS } from './docs/game.js';
import { NAMES, ACTIONS } from './docs/data.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// Stops every minute exactly, with no fake riders, unless a test asks otherwise.
function setup(options = {}) {
  const clock = { t: 0 };
  // random() of 0.5 means "sit next to someone" and "the middle of the list".
  const game = new BusGame({ now: () => clock.t, random: () => 0.5, stopEveryMs: [MINUTE, MINUTE], fakePerStop: 0, ...options });
  const advance = (ms) => { clock.t += ms; game.update(); };
  return { game, clock, advance };
}

// Tickets are random, so tests that need a specific one set it directly.
function give(game, id, name, actionId) {
  Object.assign(game.people.get(id), { name, actionId });
}

function putOnBus(game, advance, riders) {
  for (const [id, name, action] of riders) {
    game.join(id);
    give(game, id, name, action);
  }
  advance(MINUTE);
}

const leaveAtNextStop = (game, id) => { game.people.get(id).leaveAt = 0; };
const lines = (game) => game.log.map((l) => l.text);

// --- boarding ---

test('you get a ticket when you arrive, without doing anything', () => {
  const { game, advance } = setup({ random: Math.random });
  game.join('a');
  const a = game.view('a');
  assert.ok(Object.values(NAMES).flat().map((name) => name.toUpperCase()).includes(a.name));
  assert.ok(ACTIONS.some((action) => action.id === a.actionId));
  advance(MINUTE);
  assert.equal(game.view('a').phase, 'bus');
  assert.equal(game.view('a').name, a.name);
});

test('two people do not get the same name while others are free', () => {
  const { game } = setup();
  game.join('a');
  game.join('b');
  assert.notEqual(game.view('a').name, game.view('b').name);
});

test('five people enter per stop, the others keep waiting', () => {
  const { game, advance } = setup();
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) game.join(id);
  assert.equal(game.view('e').isNext, true);
  assert.equal(game.view('f').isNext, false);
  advance(MINUTE);
  assert.equal(game.riders.length, 5);
  assert.equal(game.view('f').phase, 'queue');
  assert.equal(game.view('f').position, 1);
  assert.equal(game.view('f').isNext, true);
});

test('arriving just before a stop still gets you on at that stop', () => {
  const { game, advance } = setup();
  game.join('a');
  advance(MINUTE);
  advance(59 * SECOND);
  game.join('b');
  advance(1 * SECOND);
  assert.equal(game.view('b').phase, 'bus');
});

test('only as many people enter as there are free seats, the others keep their place', () => {
  const { game, advance } = setup({ maxRiders: 3 });
  for (const id of ['a', 'b', 'c', 'd', 'e']) game.join(id);
  advance(MINUTE);
  assert.equal(game.riders.length, 3);
  assert.equal(game.view('d').position, 1);
  assert.equal(game.view('d').busFull, true);
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  assert.equal(game.view('d').phase, 'bus');
  assert.equal(game.view('e').phase, 'queue');
});

test('you are only next if a seat will be free at the next stop', () => {
  const { game, advance } = setup({ maxRiders: 2 });
  for (const id of ['a', 'b', 'c']) game.join(id);
  advance(MINUTE);
  assert.equal(game.view('c').isNext, false);
  leaveAtNextStop(game, 'a');
  assert.equal(game.view('c').isNext, true);
});

// --- time ---

test('the bus stops every 2 to 3 minutes', () => {
  for (const [random, gap] of [[0, 2 * MINUTE], [0.5, 2.5 * MINUTE], [0.999999, 3 * MINUTE]]) {
    const { game, clock } = setup({ random: () => random, stopEveryMs: undefined });
    game.join('a');
    assert.ok(Math.abs(game.nextStopAt - clock.t - gap) < SECOND);
  }
});

test('your time on the bus is between 8 and 20 minutes', () => {
  for (const [random, length] of [[0, 8 * MINUTE], [0.5, 14 * MINUTE], [0.999999, 20 * MINUTE]]) {
    const { game, clock, advance } = setup({ random: () => random });
    game.join('a');
    advance(MINUTE);
    assert.ok(Math.abs(game.people.get('a').leaveAt - clock.t - length) < SECOND);
  }
});

test('you stay on, get told once your stop is next, then get off there', () => {
  const { game, advance } = setup({ rideLengthMs: [3.5 * MINUTE, 3.5 * MINUTE] });
  game.join('a');
  advance(MINUTE); // boards, leaves after minute 4.5, so at the stop of minute 5
  const seat = game.people.get('a').seat;
  const { actionId } = game.view('a');
  for (let i = 0; i < 3; i++) {
    assert.equal(game.view('a').yourStopIsNext, false);
    advance(MINUTE);
  }
  assert.equal(game.view('a').phase, 'bus');
  assert.equal(game.people.get('a').seat, seat);
  assert.equal(game.view('a').actionId, actionId);
  assert.equal(game.view('a').yourStopIsNext, true);
  advance(MINUTE);
  assert.equal(game.view('a').phase, 'off');
  assert.ok(game.view('a').stops >= 4);
  assert.equal(game.nextStopAt, null, 'the clock stops when nobody is left');
});

// --- your action ---

test('you keep one action and can do it several times', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun']]);
  assert.equal(game.trigger('a'), true);
  assert.equal(game.trigger('a'), true);
  assert.deepEqual(lines(game).slice(-2), ['cookie contemplates the sun', 'cookie contemplates the sun']);
  assert.equal(game.people.get('a').actionId, 'sun');
});

test('a neighbour turns the action into a mix, and replaces "you"', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'read']]);
  game.people.get('a').seat = 0;
  game.people.get('b').seat = 1;
  game.trigger('a');
  assert.ok(lines(game).includes('cookie waves at iris'));
  assert.ok(lines(game).includes('cookie waves at iris, who turns the page and pretends not to see'));
});

test('nobody close enough gives a plain line, and "you" becomes nobody', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'read']]);
  game.people.get('a').seat = 0;
  game.people.get('b').seat = 24;
  game.trigger('a');
  assert.ok(lines(game).includes('cookie waves at nobody'));
  assert.equal(game.log.filter((l) => l.kind === 'mix').length, 0);
});

test('seats across the aisle are not close', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'read']]);
  game.people.get('a').seat = 1; // x = 1
  game.people.get('b').seat = 2; // x = 3
  assert.equal(game.closestTo(game.people.get('a')), null);
});

test('the closest neighbour wins over a diagonal one', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'read'], ['c', 'lion', 'sun']]);
  game.people.get('a').seat = 0;
  game.people.get('b').seat = 5; // diagonal
  game.people.get('c').seat = 1; // right beside
  assert.equal(game.closestTo(game.people.get('a')).name, 'lion');
});

test('at most one mix every 10 seconds, the other actions stay plain', () => {
  const { game, clock, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun'], ['b', 'iris', 'read']]);
  game.people.get('a').seat = 0;
  game.people.get('b').seat = 1;
  game.trigger('a');
  clock.t += 5 * SECOND;
  game.trigger('b');
  assert.equal(game.log.filter((l) => l.kind === 'mix').length, 1);
  clock.t += 5 * SECOND;
  game.trigger('b');
  assert.equal(game.log.filter((l) => l.kind === 'mix').length, 2);
});

// --- memories ---

test('when you get off you keep the best moments of your ride', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'read']]);
  game.people.get('a').seat = 0;
  game.people.get('b').seat = 1;
  game.trigger('a');
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  const { phase, stops, memories } = game.view('a');
  assert.equal(phase, 'off');
  assert.equal(stops, 1);
  assert.deepEqual(memories.map((m) => m.text), ['cookie waves at iris, who turns the page and pretends not to see']);
  assert.equal(memories[0].mine, true);
});

test('a mix beats a plain action when there are too many memories', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave']]);
  const a = game.people.get('a');
  for (const text of ['one', 'two', 'three', 'four', 'five', 'six']) game.addLine(text, [a], 'action');
  game.addLine('a mix between others', [], 'mix');
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  const memories = game.view('a').memories.map((m) => m.text);
  assert.equal(memories.length, 2);
  assert.ok(memories.includes('a mix between others'));
});

test('repeating an action gives one memory', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun']]);
  game.trigger('a');
  game.trigger('a');
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  assert.equal(game.view('a').memories.length, 1);
});

test('the same moment with the names swapped gives one memory', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun']]);
  const a = game.people.get('a');
  game.addLine('cookie and shy hold on to each other', [a], 'mix');
  game.addLine('shy and cookie hold on to each other', [a], 'mix');
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  assert.equal(game.view('a').memories.length, 1);
});

test('a ride where nothing happened leaves no memories', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun']]);
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  assert.deepEqual(game.view('a').memories, []);
});

// --- fake riders ---

test('2 fake riders enter at each stop, with their own names', () => {
  const { game, advance } = setup({ fakePerStop: 2 });
  game.join('a');
  advance(MINUTE);
  assert.equal(game.riders.length, 3);
  advance(MINUTE);
  assert.equal(game.riders.length, 5);
  assert.equal(new Set(game.riders.map((p) => p.name)).size, 5);
  assert.equal(game.view('a').seats.length, 5);
  assert.equal(new Set(game.riders.map((p) => p.seat)).size, 5);
});

test('you can mix with a fake rider', () => {
  const { game, advance } = setup({ fakePerStop: 2 });
  putOnBus(game, advance, [['a', 'cookie', 'wave']]);
  const fake = game.riders.find((p) => p.fake);
  game.people.get('a').seat = 0;
  fake.seat = 1;
  game.trigger('a');
  assert.ok(game.log.some((l) => l.kind === 'mix' && l.text.includes(fake.name)));
});

test('fake riders do their action by themselves, again and again', () => {
  const { game, clock } = setup({ fakePerStop: 1, stopEveryMs: [10 * MINUTE, 10 * MINUTE], fakeActsEveryMs: [MINUTE, MINUTE] });
  game.join('a');
  clock.t += 10 * MINUTE;
  assert.equal(game.update(), true); // the stop: a and one fake rider board
  const fake = game.riders.find((p) => p.fake);
  const count = () => game.log.filter((l) => l.kind === 'action' && l.ids.includes(fake.id)).length;
  assert.equal(count(), 0);
  clock.t += 59 * SECOND;
  assert.equal(game.update(), false);
  clock.t += 1 * SECOND;
  assert.equal(game.update(), true);
  assert.equal(count(), 1);
  clock.t += MINUTE;
  game.update();
  assert.equal(count(), 2);
  assert.equal(game.people.get('a').triggered, undefined);
  assert.equal(game.log.filter((l) => l.kind === 'action' && l.ids.includes('a')).length, 0);
});

test('fake riders get off when their time is up', () => {
  const { game, advance } = setup({ fakePerStop: 1, rideLengthMs: [1.5 * MINUTE, 1.5 * MINUTE] });
  game.join('a');
  game.people.get('a');
  advance(MINUTE);
  game.people.get('a').leaveAt = Infinity;
  const fake = game.riders.find((p) => p.fake);
  advance(MINUTE);
  assert.equal(game.people.has(fake.id), true);
  advance(MINUTE);
  assert.equal(game.people.has(fake.id), false);
  assert.ok(lines(game).some((line) => line.startsWith('next stop') && line.includes(`${fake.name} got off`)));
});

test('a real person takes the seat of a fake rider when the bus is full', () => {
  const { game, advance } = setup({ fakePerStop: 2, maxRiders: 3 });
  game.join('a');
  advance(MINUTE);
  assert.equal(game.riders.length, 3);
  assert.equal(game.view('a').busFull, false);
  game.join('b');
  assert.equal(game.view('b').isNext, true);
  advance(MINUTE);
  assert.equal(game.view('b').phase, 'bus');
  assert.equal(game.riders.length, 3);
});

test('when the last real person leaves, the fake riders go and the bus stops', () => {
  const { game, advance } = setup({ fakePerStop: 2 });
  game.join('a');
  advance(MINUTE);
  game.leave('a');
  assert.equal(game.riders.length, 0);
  assert.equal(game.nextStopAt, null);
});

// --- coming and going ---

test('closing the page takes you off the bus and out of the queue', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun']]);
  game.join('b');
  game.leave('a');
  assert.ok(lines(game).includes('cookie got off'));
  game.leave('b');
  assert.equal(game.queue.length, 0);
  assert.equal(game.nextStopAt, null);
});

test('riders only see the log from the moment they boarded', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun']]);
  game.trigger('a');
  game.join('b');
  give(game, 'b', 'iris', 'read');
  advance(MINUTE);
  const seen = game.view('b').log.map((l) => l.text);
  assert.deepEqual(seen, ['next stop. iris got on']);
});

test('after getting off the experience is over, even if you reload', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave']]);
  game.trigger('a');
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  const { memories } = game.view('a');
  game.join('a'); // what a reload does
  assert.equal(game.view('a').phase, 'off');
  assert.equal(game.view('a').name, 'cookie');
  assert.deepEqual(game.view('a').memories, memories);
  assert.equal(game.queue.length, 0);
});

test('the bus has 25 seats, with a back bench of 5', () => {
  assert.equal(SEATS.length, 25);
  assert.equal(new Set(SEATS.map((s) => `${s.x},${s.y}`)).size, 25);
  assert.equal(SEATS.filter((s) => s.y === 5).length, 5);
  assert.equal(new BusGame().maxRiders, 25);
});

test('the same moment with another name gives one memory', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'sun']]);
  const a = game.people.get('a');
  game.addLine('cookie is too busy to notice tacky falling', [a], 'mix');
  game.addLine("cookie is too busy to notice tomato falling", [a], 'mix');
  game.addLine('a different moment', [a], 'mix');
  leaveAtNextStop(game, 'a');
  advance(MINUTE);
  assert.deepEqual(game.view('a').memories.map((m) => m.text), ['cookie is too busy to notice tacky falling', 'a different moment']);
});

// --- no server: a bus with people on it, and a ride that survives a reload ---

test('the bus arrives with fake riders already on it', () => {
  const { game, advance } = setup({ fakeAtStart: 11 });
  game.join('a');
  assert.equal(game.riders.length, 11);
  advance(MINUTE);
  assert.equal(game.view('a').phase, 'bus');
  assert.equal(game.view('a').seats.length, 12);
  assert.deepEqual(game.view('a').log.map((l) => l.text), [`next stop. ${game.view('a').name} got on`]);
});

test('a saved ride carries on after a reload', () => {
  const { game, clock, advance } = setup({ fakeAtStart: 3 });
  game.join('a');
  advance(MINUTE);
  game.trigger('a');
  const saved = JSON.parse(JSON.stringify(game.save()));

  const reloaded = new BusGame({ now: () => clock.t, random: () => 0.5, stopEveryMs: [MINUTE, MINUTE], fakePerStop: 0 });
  reloaded.load(saved);
  reloaded.join('a');
  assert.deepEqual(reloaded.view('a'), game.view('a'));
  assert.equal(reloaded.lastMixAt, game.lastMixAt);
  assert.equal(reloaded.trigger('a'), true);
});

test('a save from before any mix allows a mix straight away', () => {
  const { game, clock } = setup();
  game.join('a');
  const reloaded = new BusGame({ now: () => clock.t });
  reloaded.load(JSON.parse(JSON.stringify(game.save())));
  assert.equal(reloaded.lastMixAt, -Infinity);
  assert.equal(reloaded.queue[0], reloaded.people.get('a'));
});

// --- changing seat ---

test('you can move to a free seat and then act with your new neighbour', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'sun']]);
  game.people.get('a').seat = 0;
  game.people.get('b').seat = 24;
  assert.equal(game.move('a', 23), true);
  assert.equal(game.people.get('a').seat, 23);
  assert.ok(!lines(game).some((line) => line.includes('moves')), 'moving is not written in the story');
  game.trigger('a');
  assert.ok(lines(game).includes('cookie waves at iris'));
});

test('you cannot move to a taken seat, a seat that does not exist, or before boarding', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'sun']]);
  game.join('c');
  const taken = game.people.get('b').seat;
  assert.equal(game.move('a', taken), false);
  assert.equal(game.move('a', 25), false);
  assert.equal(game.move('a', 1.5), false);
  assert.equal(game.move('c', 10), false);
});

test('doing your action is remembered, so the bus can show your arms', () => {
  const { game, clock, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave']]);
  assert.equal(game.view('a').seats[0].actedAt, null);
  game.trigger('a');
  assert.equal(game.view('a').seats[0].actedAt, clock.t);
  assert.equal(game.view('a').seats[0].actionId, 'wave');
});

test('a stop is one line, so the story of the ride stays on screen', () => {
  const { game, advance } = setup();
  putOnBus(game, advance, [['a', 'cookie', 'wave'], ['b', 'iris', 'sun'], ['c', 'shy', 'read']]);
  assert.deepEqual(lines(game), ['the bus arrives. cookie, iris and shy got on']);
  leaveAtNextStop(game, 'a');
  leaveAtNextStop(game, 'b');
  game.join('d');
  give(game, 'd', 'aya', 'bar');
  advance(MINUTE);
  assert.equal(lines(game).at(-1), 'next stop. cookie and iris got off. aya got on');
  assert.equal(game.view('a').stops, 1);
  advance(MINUTE);
  assert.equal(lines(game).at(-1), 'next stop');
});
