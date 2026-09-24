import test from "node:test";
import assert from "node:assert/strict";
import { runParity } from "./world-parity.mjs";

// Compares js/world.js against the golden browser autopilot baseline
// (tests/golden/baseline-dish1.json). Skips cleanly while the baseline file
// has not landed yet; fails on any field mismatch once it has.
test("world.js reproduces the golden browser autopilot baseline (dish/1)", async () => {
  const r = await runParity();
  if (!r.skipped) {
    assert.equal(r.failed, 0, `${r.failed} mismatched field(s) vs tests/golden/baseline-dish1.json`);
  }
});
