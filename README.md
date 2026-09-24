<div align="center">
  <h1>fruitflyworld / sim</h1>
  <p><strong>The simulation core of <a href="https://fruitfly.world">fruitfly.world</a> — the dish world, the escape circuit, and a slot for a brain.</strong></p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-baff35" alt="MIT"></a>
    <a href="../../actions/workflows/ci.yml"><img src="https://github.com/fruitflyworld/sim/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <img src="https://img.shields.io/badge/dependencies-0-10b981" alt="zero dependencies">
  </p>
</div>

---

Zero dependencies. Zero build. Plain ES modules that run in the browser and, unchanged, in
Node 22 — the same files the live game at [fruitfly.world/play](https://fruitfly.world/play)
executes in production. This repository is the source of truth for the numbers; the game
vendors these files.

## What is in here

| Module | What it holds |
| --- | --- |
| [`js/sim.js`](js/sim.js) | The deterministic dish world: seeded RNG (`makeRng`), the mutation draft (`draftCards`, `draftSeed`), the escape assay and the real-vs-swapped wiring check (`runExperiment`) |
| [`js/gf-neuron.js`](js/gf-neuron.js) | The brainstem: a leaky integrate-and-fire **Giant Fiber** driven by **LC4** (angular velocity) and **LPLC2** (looming) — the two visual neurons that dominate the real fruit fly's escape command cell |
| [`js/cx-circuit.js`](js/cx-circuit.js) | **FFW-CX/0.1** — a 24-neuron spiking circuit with connectome-inspired structure. All randomness is at construction time, which is what makes it examinable |
| [`js/brain.js`](js/brain.js) | The brain contract: signals in → behavior distribution + confidence out, every decision sealed with a FNV-1a `contentHash` |
| [`js/brain-circuit.js`](js/brain-circuit.js) | Wraps FFW-CX into the brain contract |
| [`js/brain-local.js`](js/brain-local.js) | A free local heuristic brain — the default judgment layer |
| [`js/brain-jev.js`](js/brain-jev.js) | A System One-compatible judgment brain: pinned model, same-origin proxy, hard-fails on floating aliases |
| [`js/brain-driver.js`](js/brain-driver.js) | The metronome: steps synchronous brains on a clock, lets async brains fly solo, expires and drops stale answers, flags degradation |

Each `.js` ships with a sibling `.d.ts`.

## The pinned numbers

These are not aspirations; they are assertions. `npm test` (36 tests, Node 22's built-in
runner — no install step) fails if any of them drift:

| Fact | Value | Source |
| --- | --- | --- |
| Real connectivity escapes telegraphed lunges | **100%** of 200 (`runExperiment(1337)`) | `tests/gf-neuron.test.ts` |
| Swapped connectivity escapes | **68%** of 200 | same wiring check, same seed |
| FFW-CX behavior trace, seed 42 | `contentHash = 9fb9e0d0` | `tests/cx-circuit.test.ts` |
| FFW-CX hunger assay, bucket 1 | 274 of 300 ticks | `tests/cx-circuit.test.ts` |
| Mutation draft golden vector | `contentHash = 0f4d39c3` | `tests/sim-cards.test.ts` |
| Escape trial seed 12345, real | `{escaped: true, lead: 0.1833…}` | `tests/gf-neuron.test.ts` |

The 100/68 pair is a **simplified two-channel wiring check**, not a control experiment on
the connectome: within this model, real-beats-swapped holds by construction, and the escape
rates are a function of hand-set parameters. (The code identifier stays `"shuffled"` — the
pinned golden vectors hash it.)

## Use it

```js
import { makeRng, draftCards, makeGFState, runExperiment } from "./js/sim.js";

runExperiment(1337);          // { n: 200, realEscape: 100, shufEscape: 68, ... }
makeRng(42) === makeRng(42);  // same seed, same sequence, forever
```

```js
import { createCircuitBrain } from "./js/brain-circuit.js";

const brain = createCircuitBrain(42, 100);       // seed, interval ms
const record = await brain.decide({              // the whole brain contract
  tick: 0,
  signals: { food: 0.7, threat: 0.1, light: 0.5, novelty: 0.2 },
  energy: 60, timeLeft: 40,
});
// record.behavior, record.confidence, record.distribution, record.contentHash
```

## The brain contract

Above the brainstem, everything is a **slot**. A brain is anything that fulfills one
contract: given four signals (food proximity, threat, light, novelty), energy and a clock,
return one behavior (approach / avoid / explore / freeze) and a confidence. The brain
chooses; the brainstem jumps — the escape reflex is not pluggable, because that is the
biology the project is built around.

## Honest boundaries

- The circuits are **connectome-inspired**, not simulations of a real fly brain, not
  FlyWire or MaleCNS runtimes, and not claims about animal behavior.
- One seed is one row of a table, not a theorem.

## Related repositories

| Repository | What it holds |
| --- | --- |
| [fruit-fly-world](https://github.com/fruitflyworld/fruit-fly-world) | The full site: game, exam room, missions, Passport contract |
| [game](https://github.com/fruitflyworld/game) | The playable game (Phaser), with this core vendored |
| [bench](https://github.com/fruitflyworld/bench) | The reproducible double-run exam harness |

Vulnerabilities are reported privately through the
[main repository's security policy](https://github.com/fruitflyworld/fruit-fly-world/blob/main/SECURITY.md),
not in public issues.

## License

MIT © 2026 Fruit Fly World
