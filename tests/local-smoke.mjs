import assert from "node:assert/strict";
import {randomBytes, randomUUID} from "node:crypto";
const base = process.env.PORTAL_TEST_URL || "http://127.0.0.1:8787";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const clients = ["caster", "scribe", "relay"].map(role => ({role, token: randomBytes(32).toString("hex"), seq: 0}));
let code;
async function call(client, body, expected = 200) {
  const response = await fetch(base + "/api/ritual", {method: "POST", headers: {"Content-Type": "application/json", Authorization: "Bearer " + client.token}, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)});
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data.room || data;
}
async function action(client, input) {return call(client, {op: "sync", code, actions: [{...input, seq: ++client.seq}]});}
const sync = client => call(client, {op: "sync", code});
const [caster, scribe, relay] = clients;
try {
  for (const path of ["/", "/chronicle", "/lab", "/workshop", "/play", "/learning/PITCH-TH.md", "/classic", "/vision/gesture_recognizer.task", "/vision/vision_wasm_internal.wasm", "/assets/sanzaru/shrine.svg", "/assets/sanzaru/relay.svg", "/assets/sanzaru/caster.svg", "/assets/sanzaru/scribe.svg", "/assets/sanzaru/shadow.svg"]) {
    const response = await fetch(base + path, {signal: AbortSignal.timeout(10000)});
    assert.equal(response.status, 200, path);
    assert((await response.arrayBuffer()).byteLength > 0, path);
  }
  code = (await call(caster, {op: "create", name: "Smoke caster", role: "caster"})).code;
  for (const client of [scribe, relay]) await call(client, {op: "join", code, name: "Smoke " + client.role, role: client.role});
  for (let i = 0; i < 3; i++) assert.equal(new Set((await action(caster, {type: "rotate"})).players.map(p => p.role)).size, 3);
  await Promise.all(clients.map(client => action(client, {type: "ready", ready: true})));
  assert.equal((await action(caster, {type: "start"})).phase, "countdown");
  await wait(3200);
  let [cv, sv, rv] = await Promise.all(clients.map(sync));
  assert.equal(cv.phase, "playing"); assert.equal(sv.manual.length, 6);
  assert(!("manual" in cv)); assert(!("target" in sv)); assert(!("manual" in rv)); assert(!("target" in rv));
  const recipe = sv.manual.find(r => JSON.stringify(r.rune) === JSON.stringify(cv.target));
  assert(recipe);
  const point = id => ({x: .2 + ((id - 1) % 3) * .3, y: .2 + Math.floor((id - 1) / 3) * .3});
  const path = [{...point(recipe.path[0]), t: 0}];
  for (let k = 1; k < recipe.path.length; k++) {
    const a = point(recipe.path[k - 1]), b = point(recipe.path[k]);
    for (let i = 1; i <= 12; i++) path.push({x: a.x + (b.x - a.x) * i / 12, y: a.y + (b.y - a.y) * i / 12, t: path.length * 30});
  }
  await action(caster, {type: "begin"}); await wait(1200);
  cv = await action(caster, {type: "cast", challenge: cv.challenge, path, gesture: recipe.gesture, hold: 850});
  assert.equal(cv.stage, 1);
  await action(caster, {type: "chat", to: "relay", text: "Smoke private clue"});
  assert((await sync(relay)).messages.some(m => m.text === "Smoke private clue"));
  assert(!(await sync(scribe)).messages.some(m => m.text === "Smoke private clue"));
  await action(scribe, {type: "signal", to: "relay", signal: {kind: "route", nodes: recipe.path, gesture: recipe.gesture}});
  assert((await sync(relay)).messages.some(m => m.signal?.kind === "route"));
  assert(!(await sync(caster)).messages.some(m => m.signal));
  await call(scribe, {op: "sync", code, actions: [{seq: scribe.seq + 1, type: "chat", to: "relay", text: "Blocked by vow"}]}, 403);
  await wait(750);
  const id = randomUUID(), form = new FormData();
  form.set("code", code); form.set("to", "relay"); form.set("id", id);
  // Synthetic bytes verify storage/authorization, not recording or playback.
  form.set("audio", new Blob([new Uint8Array(150)], {type: "audio/webm"}), "smoke.webm");
  const upload = await fetch(base + "/api/ritual/voice", {method: "POST", headers: {Authorization: "Bearer " + caster.token}, body: form});
  assert.equal(upload.status, 200, await upload.text());
  for (const [client, status] of [[relay, 200], [scribe, 403], [caster, 403]]) {
    const response = await fetch(base + "/api/ritual/voice?code=" + code + "&id=" + id, {headers: {Authorization: "Bearer " + client.token}});
    assert.equal(response.status, status); await response.arrayBuffer();
  }
  console.log("PASS: built pages/assets, local DB, 3 clients, rotation, role secrecy, cast, private chat, voice storage and authorization.");
} finally {if (code) await action(caster, {type: "leave"});}
