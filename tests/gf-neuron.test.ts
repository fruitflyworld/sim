import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGFState, stepGF, fireGF, gfChannels, gfPotential, GF_PARAMS
} from "../js/gf-neuron.js";
import { simEscapeTrial, runExperiment, makeFly, seedRng } from "../js/sim.js";

const DT = 1 / 60;

// Drive the pure unit with a looming stimulus, mirroring the assay geometry.
function driveLoom(mode: string, frames = 300) {
  const g = makeGFState();
  let d = 0.8, v = 0.12, prevTheta = 0;
  for (let i = 0; i < frames; i++) {
    v += 0.9 * DT; d -= v * DT; if (d < 0.02) d = 0.02;
    const theta = 2 * Math.atan(0.11 / d);
    const vel = Math.max(0, (theta - prevTheta) / DT); prevTheta = theta;
    stepGF(g, DT, {
      size: d > 0.8 ? 0 : theta, vel: d > 0.8 ? 0 : vel, mode,
      threshold: GF_PARAMS.THRESHOLD, now: i * DT, refractory: 0.95
    });
  }
  return g;
}

test("same inputs produce the same neural state", () => {
  assert.deepEqual(driveLoom("real"), driveLoom("real"));
  assert.deepEqual(driveLoom("shuffled"), driveLoom("shuffled"));
});

test("membrane potential leaks to zero with no stimulus", () => {
  const g = makeGFState();
  g.pot = 1;
  let last = g.pot;
  for (let i = 0; i < 240; i++) {
    stepGF(g, DT, { size: 0, vel: 0, mode: "real" });
    assert.ok(g.pot <= last, "potential must be non-increasing with zero input");
    last = g.pot;
    assert.equal(g.lc4, 0);
    assert.equal(g.lplc2, 0);
  }
  assert.ok(g.pot < 0.01);
});

test("reaching threshold arms once, firing resets and enforces refractory", () => {
  const g = makeGFState();
  // Saturating stimulus: both channels near max.
  const strong = { size: GF_PARAMS.SIZE_PEAK, vel: 2.2, mode: "real" as const };
  stepGF(g, DT, { ...strong, threshold: GF_PARAMS.THRESHOLD, now: 0, refractory: 0.95 });
  assert.ok(g.pot > 0 && g.pot < GF_PARAMS.THRESHOLD, "one step cannot cross threshold from rest");
  let armedAt = -1;
  for (let i = 1; i < 60 && armedAt < 0; i++) {
    stepGF(g, DT, { ...strong, threshold: GF_PARAMS.THRESHOLD, now: i * DT, refractory: 0.95 });
    if (g.armed) armedAt = i * DT;
  }
  assert.ok(armedAt > 0, "sustained stimulus must eventually arm the GF");

  // Fire: membrane resets, refractory window opens, armed drops immediately.
  fireGF(g, armedAt);
  assert.equal(g.pot, 0);
  assert.equal(g.armed, false);

  // Inside the refractory window the unit stays disarmed even with full stimulus.
  for (let i = 0; i < 30; i++) {
    const now = armedAt + (i + 1) * DT;
    stepGF(g, DT, { ...strong, threshold: GF_PARAMS.THRESHOLD, now, refractory: 0.95 });
    assert.equal(g.armed, false, `armed inside refractory at t=${now}`);
    assert.ok(g.pot < 1, "potential integrates but cannot re-trigger during refractory");
  }
  // After the refractory window it can arm again.
  let rearmed = false;
  for (let i = 30; i < 60 && !rearmed; i++) {
    const now = armedAt + (i + 1) * DT;
    stepGF(g, DT, { ...strong, threshold: GF_PARAMS.THRESHOLD, now, refractory: 0.95 });
    rearmed = g.armed;
  }
  assert.ok(rearmed, "unit must re-arm after the refractory window");
});

test("real and shuffled connectivity are distinguishable and reproducible", () => {
  // Channel activations are pure functions of the stimulus.
  assert.deepEqual(gfChannels(1.4, 1.0), gfChannels(1.4, 1.0));
  // Early loom: velocity is already high while angular size is still small.
  // Real wiring puts the big weight on the leading channel (velocity).
  assert.ok(gfPotential(0.5, 2.2, "real") > gfPotential(0.5, 2.2, "shuffled"));
  assert.ok(gfPotential(0.5, 2.2, "real") > gfPotential(0.5, 0.05, "real"));
  const a = driveLoom("real"), b = driveLoom("shuffled");
  assert.ok(Math.abs(a.pot - b.pot) > 1e-9 || Math.abs(a.lc4 - b.lc4) > 1e-9);
});

test("escape assay and experiment outputs stay pinned to the published numbers", () => {
  assert.deepEqual(simEscapeTrial("real", 12345), simEscapeTrial("real", 12345));
  assert.deepEqual(simEscapeTrial("real", 12345), { valid: true, escaped: true, lead: 0.1833333333333338 });
  assert.deepEqual(simEscapeTrial("shuffled", 12345), { valid: true, escaped: false, lead: 0.16666666666666707 });
  const exp = runExperiment(1337);
  assert.deepEqual(exp, runExperiment(1337));
  assert.equal(exp.n, 200);
  assert.equal(exp.realEscape, 100);
  assert.equal(exp.shufEscape, 68);
  assert.ok(exp.realLead > exp.shufLead);
});

test("makeFly carries the canonical neural state shape", () => {
  // makeFly seeds the RNG; fix the seed first for determinism.
  seedRng(7);
  const fly = makeFly(true, { food: 0.5, threat: 0.5, light: 0.5, novelty: 0.5, forage: 0.5 });
  assert.deepEqual(Object.keys(fly.gf).sort(), Object.keys(makeGFState()).sort());
  assert.deepEqual(fly.gf, makeGFState());
});
