#!/usr/bin/env node
// cli.mjs — run the pure-Node dish world exactly as the browser autopilot does.
//
//   node cli.mjs --seed 42 --brain circuit --gens 3
//
// Prints the per-generation results (same fields the parity harness compares)
// as JSON. Zero dependencies.
import { runLineage, WORLD_VERSION } from "./js/world.js";

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0 || i + 1 >= process.argv.length) return def;
  const v = process.argv[i + 1];
  return v === undefined || String(v).startsWith("--") ? def : v;
}

const seed = Number(arg("seed", 42));
const brain = arg("brain", "circuit");
const gens = Number(arg("gens", 3));

const results = await runLineage({ seed, brain, gens });

console.log(JSON.stringify({
  version: WORLD_VERSION,
  seed, brain,
  gens: results.length,
  eggsTotal: results.reduce((a, g) => a + g.eggs, 0),
  decisions: results.reduce((a, g) => a + g.decisions, 0),
  results: results.map(({ gen, eggs, rivalEggs, survived, deathReason, decisions, logHash, brainModel }) =>
    ({ gen, eggs, rivalEggs, survived, deathReason, decisions, logHash, brainModel }))
}, null, 2));
