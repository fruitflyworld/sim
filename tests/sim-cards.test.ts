import test from "node:test";
import assert from "node:assert/strict";
import { makeRng, draftCards, draftSeed, rollRivalGenes, seedRng, randRange, STACKABLE, NAMED_ONCE } from "../js/sim.js";
import { contentHash } from "../js/brain.js";

test("makeRng: same seed replays the same stream, different seeds diverge", () => {
  const a = Array.from({ length: 12 }, makeRng(42));
  const b = Array.from({ length: 12 }, makeRng(42));
  const c = Array.from({ length: 12 }, makeRng(43));
  assert.deepEqual(a, b);
  assert.ok(a.some((v, i) => Math.abs(v - c[i]) > 1e-9));
});

test("draftCards: pure — same inputs, same three cards (golden pinned)", () => {
  const draw = () => draftCards(42, 3, 7, 5, ["white", "fecund"]);
  const a = draw();
  const b = draw();
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  // golden vector: any change to the draw numerics breaks this hash
  assert.equal(contentHash(a), "0f4d39c3");
});

test("draftCards: outcome shapes the draft — different eggs draw different cards", () => {
  const diffs = new Set();
  for (let eggs = 0; eggs < 12; eggs++) {
    diffs.add(contentHash(draftCards(42, 2, eggs, 5, [])));
  }
  assert.ok(diffs.size > 1, "egg count must influence the draw");
});

test("draftCards: owned named-once traits never reappear", () => {
  const owned = NAMED_ONCE.slice(); // own them all
  for (let seed = 1; seed < 40; seed++) {
    const cards = draftCards(seed, 5, 3, 3, owned);
    for (const c of cards) {
      if (NAMED_ONCE.includes(c)) assert.ok(false, `named-once trait ${c} was re-offered`);
    }
  }
});

test("draftCards: fallback to stackables when the pool runs dry still yields 3 cards", () => {
  const owned = NAMED_ONCE.slice();
  const cards = draftCards(7, 9, 0, 0, owned);
  assert.equal(cards.length, 3);
  assert.ok(cards.every(c => STACKABLE.includes(c)));
});

test("draftSeed: mixes every input; commutative inputs do not collide trivially", () => {
  assert.notEqual(draftSeed(42, 3, 7, 5), draftSeed(42, 3, 5, 7));
  assert.notEqual(draftSeed(42, 3, 7, 5), draftSeed(43, 3, 7, 5));
  assert.equal(draftSeed(42, 3, 7, 5), draftSeed(42, 3, 7, 5));
});

test("rollRivalGenes: pure, and bit-identical to the legacy create()-time roll (golden pinned)", () => {
  // dish/2 determinism fix: the rival's genes must be a pure function of the
  // world seed. For a fresh profile (worldSeed 1337) the values must equal
  // what the old shared-stream roll produced, so fresh-visitor play is
  // unchanged — any change to the draw numerics breaks this hash.
  const g = rollRivalGenes(1337);
  assert.deepEqual(g, rollRivalGenes(1337));
  // legacy equivalence: seedRng(1337) then the same five randRange draws
  seedRng(1337);
  const legacy = {
    food: randRange(.4, .9), threat: randRange(.4, .9),
    light: randRange(0, .5), novelty: randRange(.1, .6), forage: randRange(.3, .8),
  };
  assert.deepEqual(g, legacy);
  assert.equal(contentHash(Object.values(g)), "e9b1d202");
  // different seeds give a different wild type
  assert.notDeepEqual(rollRivalGenes(42), g);
  // the roll never touches the shared stream
  seedRng(123); rollRivalGenes(1337); rollRivalGenes(42);
  const after = randRange(0, 1);
  seedRng(123);
  assert.equal(after, randRange(0, 1));
});
