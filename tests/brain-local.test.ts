import test from "node:test";
import assert from "node:assert/strict";
import { createLocalBrain, LOCAL_MODEL_VERSION, buildLocalDecision } from "../js/brain-local.js";

const S = (over: Partial<{ food: number; threat: number; light: number; novelty: number }>) => ({
  signals: { food: 0, threat: 0, light: 0, novelty: 0, ...over },
  energy: 50, timeLeft: 30, behavior: "explore" as const,
});

test("local brain is deterministic: same state, same distribution and hash", async () => {
  const a = createLocalBrain();
  const b = createLocalBrain();
  const state = S({ food: 0.6, threat: 0.3, novelty: 0.4 });
  const ra = await a.decide(state);
  const rb = await b.decide(state);
  assert.deepEqual(ra.record.distribution, rb.record.distribution);
  assert.equal(ra.record.contentHash, rb.record.contentHash);
  assert.equal(ra.record.tick, 0);
  assert.equal(rb.record.tick, 0);
});

test("strong threat wins avoid; strong food + hunger wins approach", () => {
  assert.equal(buildLocalDecision(S({ threat: 0.9 })).behavior, "avoid");
  assert.equal(buildLocalDecision(S({ food: 0.9 })).behavior, "approach"); // hunger 0.5 at energy 50
  // hunger shifts probability mass toward approach
  const hungry = buildLocalDecision({ ...S({ food: 0.6, novelty: 0.4 }), energy: 10 });
  const well = buildLocalDecision({ ...S({ food: 0.6, novelty: 0.4 }), energy: 95 });
  assert.ok(hungry.distribution.approach > well.distribution.approach + 0.1);
});

test("distribution is a valid simplex and confidence is the winner's mass", () => {
  const d = buildLocalDecision(S({ food: 0.4, threat: 0.2, novelty: 0.3, light: 0.5 }));
  const sum = Object.values(d.distribution).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(d.confidence - Math.max(...Object.values(d.distribution))) < 1e-12);
});

test("danger score tracks threat, clamped to 0..3", () => {
  assert.equal(buildLocalDecision(S({})).dangerScore, 0);
  assert.equal(buildLocalDecision(S({ threat: 1 })).dangerScore, 3); // 3.2 clamps
  const mid = buildLocalDecision(S({ threat: 0.5 })).dangerScore;
  assert.ok(mid > 0 && mid < 3);
});

test("records are sealed with model id and pinned question text", async () => {
  const brain = createLocalBrain();
  const r = await brain.decide(S({ food: 0.3 }));
  assert.equal(r.record.model, LOCAL_MODEL_VERSION);
  assert.equal(r.record.latencyMs, 0);
  assert.ok(r.record.contentHash.length === 8);
  assert.match(r.record.question, /Which behavior should this fruit fly execute next\?/);
  brain.reset!();
  const again = await brain.decide(S({ food: 0.3 }));
  assert.equal(again.record.tick, 0);
  assert.equal(again.record.contentHash, r.record.contentHash);
});
