// The rules of the bus. No network code here, so the rules can be tested alone.
import { NAMES, ACTIONS, MIXES, GENERIC_MIX } from './data.js';

const ALL_NAMES = Object.values(NAMES).flat();
const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
const ACTION_ORDER = new Map(ACTIONS.map((a, i) => [a.id, i]));

const SHAPES = ['triangle', 'circle', 'square'];
const COLORS = ['#b5648f', '#4f7fb8', '#5a9a6e', '#c98a3c', '#8a6fc4'];

// 5 rows of 2 + aisle + 2, then a back bench of 5 = 25 seats.
// The aisle is why x jumps from 1 to 3. Only the back bench has a seat at x = 2.
const ROWS = 5;
const COLUMNS = [0, 1, 3, 4];
export const SEATS = [];
for (let y = 0; y < ROWS; y++) for (const x of COLUMNS) SEATS.push({ x, y });
for (let x = 0; x < 5; x++) SEATS.push({ x, y: ROWS });

// Side, front, back and diagonals count as close. Across the aisle does not.
const NEAR_DISTANCE = 1.5;
// How often a new rider sits somewhere random instead of next to someone.
const LONELY_SEAT_CHANCE = 0.25;
const LOG_LIMIT = 500;
const LOG_SENT = 100;
const BOARDING_PER_STOP = 5;
const MEMORIES_KEPT = 2; // the end summary stays short
const MINUTE = 60_000;

const seatDistance = (a, b) => Math.hypot(SEATS[a].x - SEATS[b].x, SEATS[a].y - SEATS[b].y);

export class BusGame {
  constructor({
    stopEveryMs = [2 * MINUTE, 3 * MINUTE],
    rideLengthMs = [8 * MINUTE, 20 * MINUTE],
    mixCooldownMs = 10_000,
    maxRiders = 25,
    fakePerStop = 2,
    fakeActsEveryMs = [1 * MINUTE, 3 * MINUTE],
    now = Date.now,
    random = Math.random,
  } = {}) {
    this.stopEveryMs = stopEveryMs;
    this.rideLengthMs = rideLengthMs;
    this.mixCooldownMs = mixCooldownMs;
    this.fakePerStop = fakePerStop;
    this.fakeActsEveryMs = fakeActsEveryMs;
    this.maxRiders = Math.min(maxRiders, SEATS.length);
    this.now = now;
    this.random = random;
    this.people = new Map();
    this.queue = [];
    this.nextStopAt = null;
    this.log = [];
    this.nextLineId = 1;
    this.lastMixAt = -Infinity;
    this.joined = 0;
  }

  get riders() {
    return [...this.people.values()].filter((p) => p.phase === 'bus');
  }

  get realRiders() {
    return this.riders.filter((p) => !p.fake);
  }

  // --- what people can do ------------------------------------------------

  join(id) {
    // Already here. If you got off, your experience is over: reloading doesn't restart it.
    if (this.people.has(id)) return this.people.get(id);
    const person = this.newPerson(id);
    this.queue.push(person);
    if (this.nextStopAt === null) this.nextStopAt = this.now() + this.timeBetween(this.stopEveryMs);
    return person;
  }

  newPerson(id) {
    const person = {
      id,
      shape: SHAPES[this.joined % SHAPES.length],
      color: COLORS[this.joined % COLORS.length],
      phase: 'queue',
      name: this.pickName(),
      actionId: this.pickAction(),
      seat: null,
      leaveAt: null,
      firstLineId: null,
      memories: [],
      stops: 0,
    };
    this.joined++;
    this.people.set(id, person);
    return person;
  }

  // The person closed the page.
  leave(id) {
    const person = this.people.get(id);
    if (!person) return;
    if (person.phase === 'bus') this.addLine(`${person.name} got off`, [person]);
    this.queue = this.queue.filter((p) => p !== person);
    this.people.delete(id);
    this.stopIfEmpty();
  }

  // Do your action. You keep the same one, and can do it as often as you like.
  trigger(id) {
    const person = this.people.get(id);
    if (!person || person.phase !== 'bus') return false;

    const neighbour = this.closestTo(person);
    const action = ACTION_BY_ID.get(person.actionId);
    const text = action.text.replace(/\byou\b/, neighbour ? neighbour.name : 'nobody');
    this.addLine(`${person.name} ${text}`, [person], 'action');

    if (neighbour && this.now() - this.lastMixAt >= this.mixCooldownMs) {
      this.lastMixAt = this.now();
      this.addLine(this.mixLine(person, neighbour), [person, neighbour], 'mix');
    }
    return true;
  }

  // --- time --------------------------------------------------------------

  timeBetween([shortest, longest]) {
    return shortest + this.random() * (longest - shortest);
  }

  // Call often. Returns true when something happened.
  update() {
    const acted = this.letFakeRidersAct();
    if (this.nextStopAt === null || this.now() < this.nextStopAt) return acted;
    this.arriveAtStop();
    return true;
  }

  // You get off at the first stop after your time on the bus is up.
  arriveAtStop() {
    const now = this.now();
    const hadRiders = this.riders.length > 0;
    const leaving = this.riders.filter((person) => person.leaveAt <= now);

    if (hadRiders) this.addLine('next stop', [], 'stop');
    for (const person of leaving) {
      this.addLine(`${person.name} got off`, [person]);
      this.keepMemories(person);
      person.phase = 'off';
      person.seat = null;
      if (person.fake) this.people.delete(person.id);
    }

    // Whoever is next boards, as long as there are free seats. The rest keep their place.
    for (const person of this.queue.slice(0, BOARDING_PER_STOP)) {
      if (this.realRiders.length >= this.maxRiders) break;
      if (this.riders.length >= this.maxRiders) this.makeRoom();
      this.board(person);
    }
    if (this.realRiders.length > 0) this.boardFakeRiders();

    this.nextStopAt = now + this.timeBetween(this.stopEveryMs);
    this.stopIfEmpty();
  }

  board(person) {
    this.queue = this.queue.filter((p) => p !== person);
    person.phase = 'bus';
    person.seat = this.pickSeat();
    person.leaveAt = this.now() + this.timeBetween(this.rideLengthMs);
    person.firstLineId = this.nextLineId;
    this.addLine(`${person.name} entered the bus`, [person]);
  }

  // --- fake riders --------------------------------------------------------

  // Characters nobody controls. They take free seats and sit as neighbours.
  boardFakeRiders() {
    for (let i = 0; i < this.fakePerStop && this.riders.length < this.maxRiders; i++) {
      const person = this.newPerson(`fake-${this.joined}`);
      person.fake = true;
      person.nextActAt = this.now() + this.timeBetween(this.fakeActsEveryMs);
      this.board(person);
    }
  }

  letFakeRidersAct() {
    const ready = this.riders.filter((p) => p.fake && p.nextActAt <= this.now());
    for (const person of ready) {
      this.trigger(person.id);
      person.nextActAt = this.now() + this.timeBetween(this.fakeActsEveryMs);
    }
    return ready.length > 0;
  }

  // A real person always gets a seat before a fake one.
  makeRoom() {
    const person = this.riders.find((p) => p.fake);
    this.addLine(`${person.name} got off`, [person]);
    this.people.delete(person.id);
  }

  stopIfEmpty() {
    if (this.queue.length > 0 || this.realRiders.length > 0) return;
    for (const person of this.riders) this.people.delete(person.id); // no one left to see them
    this.nextStopAt = null;
  }

  // Will this person get on at the next stop? Seats freed at that stop count.
  isNext(person) {
    const place = this.queue.indexOf(person);
    const staying = this.realRiders.filter((rider) => rider.leaveAt > this.nextStopAt).length;
    return place >= 0 && place < Math.min(BOARDING_PER_STOP, this.maxRiders - staying);
  }

  // --- the ticket --------------------------------------------------------

  pickFrom(list) {
    return list[Math.floor(this.random() * list.length)];
  }

  // Avoids names already at the stop or on the bus, while there are others left.
  pickName() {
    const taken = new Set([...this.people.values()].filter((p) => p.phase !== 'off').map((p) => p.name));
    const free = ALL_NAMES.filter((name) => !taken.has(name));
    return this.pickFrom(free.length ? free : ALL_NAMES);
  }

  pickAction() {
    return this.pickFrom(ACTIONS).id;
  }

  // --- seats and neighbours ----------------------------------------------

  pickSeat() {
    const taken = this.riders.filter((p) => p.seat !== null).map((p) => p.seat);
    const free = SEATS.map((_, i) => i).filter((i) => !taken.includes(i));
    const nextToSomeone = free.filter((i) => taken.some((t) => seatDistance(i, t) <= NEAR_DISTANCE));
    const pool = nextToSomeone.length && this.random() >= LONELY_SEAT_CHANCE ? nextToSomeone : free;
    return pool[Math.floor(this.random() * pool.length)];
  }

  closestTo(person) {
    const close = this.riders
      .filter((p) => p !== person)
      .map((p) => ({ p, distance: seatDistance(person.seat, p.seat) }))
      .filter(({ distance }) => distance <= NEAR_DISTANCE);
    if (!close.length) return null;
    const best = Math.min(...close.map(({ distance }) => distance));
    const tied = close.filter(({ distance }) => distance === best);
    return tied[Math.floor(this.random() * tied.length)].p;
  }

  // --- memories ----------------------------------------------------------

  // What you take with you when you get off: the best moments of your ride.
  // A mix beats a plain action, and your own moments beat other people's.
  keepMemories(person) {
    const ride = this.log.filter((line) => line.id >= person.firstLineId);
    const score = (line) => (line.kind === 'mix' ? 2 : 0) + (line.ids.includes(person.id) ? 1 : 0);
    // The same words in any order are the same moment: "a and b hug", "b and a hug".
    const sameWords = (text) => text.split(' ').sort().join(' ');
    person.stops = ride.filter((line) => line.kind === 'stop').length;
    person.memories = ride
      // A mix already says what the plain action line before it said.
      .filter((line, i) => line.kind === 'mix' || (line.kind === 'action' && ride[i + 1]?.kind !== 'mix'))
      .sort((a, b) => score(b) - score(a))
      // Repeating an action gives one memory, not five of the same.
      .filter((line, i, all) => all.findIndex((other) => sameWords(other.text) === sameWords(line.text)) === i)
      .slice(0, MEMORIES_KEPT)
      .sort((a, b) => a.id - b.id)
      .map((line) => ({ text: line.text, kind: line.kind, mine: line.ids.includes(person.id) }));
  }

  // --- the log -----------------------------------------------------------

  // To let Claude write the mixes, this is the function to replace.
  mixLine(a, b) {
    const [first, second] = ACTION_ORDER.get(a.actionId) <= ACTION_ORDER.get(b.actionId) ? [a, b] : [b, a];
    const template = MIXES[`${first.actionId}+${second.actionId}`] ?? GENERIC_MIX;
    return template.replaceAll('{1}', first.name).replaceAll('{2}', second.name);
  }

  addLine(text, people = [], kind = 'line') {
    this.log.push({
      id: this.nextLineId++,
      text,
      kind,
      ids: people.map((p) => p.id),
      shape: people[0]?.shape ?? null,
      color: people[0]?.color ?? null,
    });
    if (this.log.length > LOG_LIMIT) this.log.shift();
  }

  // --- what one person sees ----------------------------------------------

  view(id) {
    const person = this.people.get(id);
    const shared = {
      now: this.now(),
      nextStopAt: this.nextStopAt,
      riderCount: this.riders.length,
      maxRiders: this.maxRiders,
      queueLength: this.queue.length,
      busFull: this.realRiders.length >= this.maxRiders,
    };
    if (!person) return { ...shared, phase: 'gone' };

    if (person.phase === 'queue') {
      return {
        ...shared,
        phase: 'queue',
        position: this.queue.indexOf(person) + 1,
        isNext: this.isNext(person),
        name: person.name,
        actionId: person.actionId,
      };
    }

    if (person.phase === 'off') {
      return { ...shared, phase: 'off', name: person.name, stops: person.stops, memories: person.memories };
    }

    const lines = this.log
      .filter((line) => line.id >= person.firstLineId)
      .slice(-LOG_SENT)
      .map(({ id: lineId, text, kind, ids, shape, color }) => ({
        id: lineId, text, kind, shape, color, mine: ids.includes(id),
      }));

    return {
      ...shared,
      phase: 'bus',
      name: person.name,
      actionId: person.actionId,
      yourStopIsNext: person.leaveAt <= this.nextStopAt,
      seats: this.riders.map((p) => ({
        seat: p.seat,
        x: SEATS[p.seat].x,
        y: SEATS[p.seat].y,
        name: p.name,
        shape: p.shape,
        color: p.color,
        me: p === person,
      })),
      log: lines,
    };
  }
}
