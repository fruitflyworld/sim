import test from "node:test";
import assert from "node:assert/strict";
import { createBrainDriver } from "../js/brain-driver.js";
import type { Brain } from "../js/brain.js";

const STATE = {
  signals: { food: 0.5, threat: 0.2, light: 0.1, novelty: 0.3 },
  energy: 80, timeLeft: 40, behavior: "explore" as const,
};
const decision = (n: number) => ({
  behavior: "approach" as const,
  confidence: 0.7,
  record: {
    tick: n, state: STATE, question: "q", distribution: {
      approach: 0.7, avoid: 0.1, explore: 0.1, freeze: 0.1,
    } as Record<string, number>,
    behavior: "approach" as const, confidence: 0.7, dangerScore: 1,
    model: "test", latencyMs: 5, contentHash: "00000000",
  },
});

test("sync-style brain steps at the configured cadence", async () => {
  let calls = 0;
  const brain: Brain = {
    model: "FFW-CX/0.1",
    decide: () => { calls++; return Promise.resolve(decision(calls - 1)); },
  };
  const applied: number[] = [];
  const d = createBrainDriver({ brain, intervalSec: 0.5 });
  const run = (frames: number, dt = 1 / 60) => {
    for (let i = 0; i < frames; i++) d.update(i * dt, dt, () => STATE, res => applied.push(res.record.tick));
  };
  run(31); // just past 0.5s of frames (30×1/60 lands on a float boundary)
  await Promise.resolve();
  assert.equal(calls, 1);
  run(31); // 1.0s
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.deepEqual(applied, [0, 1]);
  assert.equal(d.last!.record.tick, 1);
});

test("async brain runs single-in-flight and never blocks", async () => {
  let pending: ((v: ReturnType<typeof decision>) => void) | null = null;
  let calls = 0;
  const brain: Brain = {
    model: "async-test/0.1",
    decide: () => { calls++; return new Promise(res => { pending = res; }); },
  };
  const d = createBrainDriver({ brain, intervalSec: 0.1 });
  const apply = () => { throw new Error("not yet"); };
  for (let i = 0; i < 60; i++) d.update(i / 60, 1 / 60, () => STATE, apply);
  assert.equal(calls, 1, "one decide in flight at a time");
  pending!(decision(0));
  await new Promise(r => setTimeout(r, 0));
  assert.ok(d.last);
});

test("stale results are dropped, fresh results are applied", async () => {
  let pending: ((v: ReturnType<typeof decision>) => void) | null = null;
  const brain: Brain = {
    model: "async-test/0.1",
    decide: () => new Promise(res => { pending = res; }),
  };
  const applied: number[] = [];
  const d = createBrainDriver({ brain, intervalSec: 0.1, maxStaleSec: 1 });
  d.update(0, 0.1, () => STATE, res => applied.push(res.record.tick));
  // sim advances 5s before the model answers: result is stale
  for (let i = 1; i <= 50; i++) d.update(i * 0.1, 0.1, () => STATE, res => applied.push(res.record.tick));
  pending!(decision(0));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(applied.length, 0, "stale decision must be dropped");
  assert.equal(d.last, null);
  // a fresh answer applies
  d.update(5.1, 0.1, () => STATE, res => applied.push(res.record.tick));
  pending!(decision(1));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(applied, [1]);
});

test("a rejecting brain marks the driver degraded until it recovers", async () => {
  let fail = true;
  const brain: Brain = {
    model: "async-test/0.1",
    decide: () => (fail ? Promise.reject(new Error("jev 529")) : Promise.resolve(decision(0))),
  };
  const errors: unknown[] = [];
  const d = createBrainDriver({ brain, intervalSec: 0.1, onError: e => errors.push(e) });
  d.update(0, 0.1, () => STATE, () => {});
  await new Promise(r => setTimeout(r, 0));
  assert.equal(d.degraded, true);
  assert.equal(errors.length, 1);
  fail = false;
  d.update(0.2, 0.1, () => STATE, () => {});
  await new Promise(r => setTimeout(r, 0));
  assert.equal(d.degraded, false);
  assert.ok(d.last);
});

test("reset clears cadence, in-flight state and last decision", async () => {
  let resetCount = 0;
  const brain: Brain & { reset(): void } = {
    model: "FFW-CX/0.1",
    decide: () => Promise.resolve(decision(0)),
    reset: () => { resetCount++; },
  };
  const d = createBrainDriver({ brain, intervalSec: 0.1 });
  d.update(0, 0.1, () => STATE, () => {});
  await new Promise(r => setTimeout(r, 0));
  assert.ok(d.last);
  d.reset();
  assert.equal(d.last, null);
  assert.equal(d.degraded, false);
  assert.equal(resetCount, 1);
});
