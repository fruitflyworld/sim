import test from "node:test";
import assert from "node:assert/strict";
import { createCircuit, CX_MODEL_VERSION } from "../js/cx-circuit.js";
import { createCircuitBrain } from "../js/brain-circuit.js";
import { contentHash } from "../js/brain.js";

// Deterministic scripted signal stream, independent of the circuit's own RNG.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SIGNALS = { food: 0, threat: 0, light: 0, novelty: 0 } as const;
type S = { food: number; threat: number; light: number; novelty: number };

function fullTrace(seed: number) {
  const c = createCircuit({ seed });
  const r = mulberry32(999);
  const out: string[] = [];
  for (let i = 0; i < 200; i++) {
    const s: S = { food: r(), threat: r() * 0.8, light: r(), novelty: r() };
    const o = c.step(s, r());
    out.push(JSON.stringify([o.behavior, o.confidence, o.spikes, o.probabilities]));
  }
  return out;
}
function behaviorTrace(seed: number) {
  const c = createCircuit({ seed });
  const r = mulberry32(999);
  const out: string[] = [];
  for (let i = 0; i < 200; i++) {
    const s: S = { food: r(), threat: r() * 0.8, light: r(), novelty: r() };
    const o = c.step(s, r());
    out.push(o.behavior + ":" + o.confidence.toFixed(6));
  }
  return out;
}

test("same seed replays bit-identically (behavior trace pinned)", () => {
  const a = behaviorTrace(42);
  assert.deepEqual(a, behaviorTrace(42));
  // golden vector: any change to the numerics breaks this hash
  assert.equal(contentHash(a), "9fb9e0d0");
});

test("different seeds produce distinguishable KC topology / spiking", () => {
  const a = fullTrace(42);
  const b = fullTrace(43);
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  assert.ok(diff > 0, "seed must shape the PN→KC divergence");
});

test("strong looming fires the giant fiber: avoid at confidence 0.95", () => {
  const c = createCircuit({ seed: 7 });
  let fired: { tick: number; behavior: string; confidence: number } | null = null;
  for (let i = 0; i < 50; i++) {
    const o = c.step({ ...SIGNALS, threat: 1 }, 0);
    if (o.gfFired && !fired) fired = { tick: i, behavior: o.behavior, confidence: o.confidence };
  }
  assert.ok(fired, "sustained looming must fire the GF");
  assert.equal(fired!.behavior, "avoid");
  assert.equal(fired!.confidence, 0.95);
});

test("hunger gates foraging: starved flies approach far more often", () => {
  const count = (hunger: number) => {
    const c = createCircuit({ seed: 5 });
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const o = c.step({ ...SIGNALS, food: 0.8, novelty: 0.1 }, hunger);
      if (o.behavior === "approach") n++;
    }
    return n;
  };
  assert.equal(count(0), 0);
  assert.equal(count(1), 274);
});

test("KC coding stays sparse under strong food input", () => {
  const c = createCircuit({ seed: 11 });
  let maxKC = 0;
  for (let i = 0; i < 100; i++) {
    const o = c.step({ ...SIGNALS, food: 1 }, 0.5);
    const n = Object.keys(o.spikes).filter((k) => k.startsWith("KC")).length;
    if (n > maxKC) maxKC = n;
  }
  assert.ok(maxKC < 4, `expected sparse KC activity, saw ${maxKC}/8 per tick`);
});

test("quiescent circuit falls back to freeze", () => {
  const c = createCircuit({ seed: 5 });
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) seen.add(c.step({ ...SIGNALS }, 0).behavior);
  assert.deepEqual([...seen], ["freeze"]);
});

test("circuit brain emits complete, sealed decision records", async () => {
  const brain = createCircuitBrain({ seed: 42 });
  assert.equal(brain.model, CX_MODEL_VERSION);
  const state = { signals: { ...SIGNALS, threat: 0.9 }, energy: 40, timeLeft: 30, behavior: "explore" as const };
  const a = await brain.decide(state);
  const b = await brain.decide(state);
  // same state → identical distribution, but tick increments and hashes are stable per tick
  assert.deepEqual(a.record.distribution, b.record.distribution);
  assert.equal(a.record.tick, 0);
  assert.equal(b.record.tick, 1);
  assert.ok(a.record.contentHash.length === 8);
  assert.equal(a.record.dangerScore > 0, true); // threat 0.9 → danger 2.88
  // replay: a fresh brain with the same seed reproduces the first decision exactly
  const fresh = createCircuitBrain({ seed: 42 });
  const again = await fresh.decide(state);
  assert.deepEqual(again.record.distribution, a.record.distribution);
  assert.equal(again.record.behavior, a.record.behavior);
  assert.equal(again.record.contentHash, a.record.contentHash);
  // reset restores tick 0
  brain.reset();
  const r = await brain.decide(state);
  assert.equal(r.record.tick, 0);
  assert.equal(r.record.contentHash, a.record.contentHash);
});
