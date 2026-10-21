const test = require("node:test");
const assert = require("node:assert/strict");
const { createVad } = require("./vad.js");

const SR = 1000; // 1 sample = 1 ms keeps the math easy
const opts = { sampleRate: SR, threshold: 0.05, hangMs: 300, minMs: 100, preRollMs: 50, maxMs: 2000, tailMs: 100 };
const chunk = (amp, ms = 10) => new Float32Array(ms).fill(amp);
const feed = (vad, amp, ms) => {
  const events = [];
  for (let t = 0; t < ms; t += 10) {
    const e = vad.push(chunk(amp));
    if (e) events.push(e);
  }
  return events;
};

test("silence emits nothing", () => {
  const vad = createVad(opts);
  assert.deepEqual(feed(vad, 0, 1000), []);
  assert.equal(vad.state, "idle");
});

test("speech then silence emits start, then end with the clip", () => {
  const vad = createVad(opts);
  feed(vad, 0, 200);
  assert.deepEqual(feed(vad, 0.3, 10).map((e) => e.type), ["start"]);
  assert.equal(vad.state, "speaking");
  assert.deepEqual(feed(vad, 0.3, 490), []);
  const events = feed(vad, 0, 300);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "end");
  // pre-roll 50 + speech 500 + trailing silence trimmed to tail 100
  assert.equal(events[0].samples.length, 650);
  assert.equal(events[0].samples[49], 0);
  assert.ok(Math.abs(events[0].samples[50] - 0.3) < 1e-6);
  assert.equal(vad.state, "idle");
});

test("short pauses inside speech do not end the clip", () => {
  const vad = createVad(opts);
  feed(vad, 0.3, 200);
  assert.deepEqual(feed(vad, 0, 200), []);
  assert.deepEqual(feed(vad, 0.3, 200), []);
  assert.equal(vad.state, "speaking");
});

test("a click shorter than minMs is cancelled, not played", () => {
  const vad = createVad(opts);
  feed(vad, 0.3, 50);
  const events = feed(vad, 0, 300);
  assert.deepEqual(events.map((e) => e.type), ["cancel"]);
  assert.equal(vad.state, "idle");
});

test("clip is cut at maxMs", () => {
  const vad = createVad(opts);
  const events = feed(vad, 0.3, 3000);
  const end = events.find((e) => e.type === "end");
  assert.ok(end);
  assert.ok(end.samples.length <= 2000 + 10);
});

test("reset drops a clip in progress", () => {
  const vad = createVad(opts);
  feed(vad, 0.3, 200);
  vad.reset();
  assert.equal(vad.state, "idle");
  assert.deepEqual(feed(vad, 0, 400), []);
});

test("threshold can change at runtime", () => {
  const vad = createVad(opts);
  vad.threshold = 0.5;
  assert.deepEqual(feed(vad, 0.3, 100), []);
  vad.threshold = 0.1;
  assert.deepEqual(feed(vad, 0.3, 10).map((e) => e.type), ["start"]);
});
