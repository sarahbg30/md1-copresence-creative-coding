// The live part, with playhtml (https://playhtml.fun): who else is on the
// site right now. Each person shares where they are on the bus (presence:
// gone when they close the page, nothing is saved), and pressing your action
// sends your lines to everyone (an event).
//
// sketch.js reads window.Live.people every frame, and gets actions through
// window.onLiveAct. If this file can't load, the game still runs, alone.

// playhtml keeps one identity per browser (in localStorage), so two tabs would
// be the same person. Here every tab is its own rider: each tab keeps its own
// identity in sessionStorage and puts it back before playhtml starts.
// (Put back right before init(), with nothing in between, so two tabs opening
// at the same moment can't swap identities.)
import { playhtml } from "https://unpkg.com/playhtml@2.16.0";

const ID_KEY = "playhtml_player_identity";
const mine = sessionStorage.getItem(ID_KEY);
if (mine) localStorage.setItem(ID_KEY, mine); else localStorage.removeItem(ID_KEY);
const ACT = "bus-act";
playhtml.init({ room: "3steps2gether" });
sessionStorage.setItem(ID_KEY, localStorage.getItem(ID_KEY) || "");
await playhtml.ready;
playhtml.registerPlayEventListener(ACT, { onEvent: payload => window.onLiveAct?.(payload) });   // only sticks once ready

const people = playhtml.people;
window.Live = {
  people: [],                                         // everyone else: { pid, state }
  setMe: state => people.setMyPresence("rider", state),
  send: payload => playhtml.dispatchPlayEvent({ type: ACT, eventPayload: { ...payload, pid: people.me.pid } }),
};
people.onChange("rider", everyone => {
  window.Live.people = everyone.filter(p => !p.isMe).map(p => ({ pid: p.pid, state: p.presence.rider }));
});
