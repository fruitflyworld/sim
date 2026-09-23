import test from "node:test";
import assert from "node:assert/strict";
import { createJevBrain, buildJevRequest, JEV_MODEL_DEFAULT, JEV_ENDPOINT_DEFAULT } from "../js/brain-jev.js";
import { contentHash } from "../js/brain.js";

const STATE = {
  signals: { food: 0.5, threat: 0.2, light: 0.1, novelty: 0.3 },
  energy: 80, timeLeft: 40, behavior: "explore" as const,
};

const okResponse = () => ({
  ok: true, status: 200,
  json: async () => ({
    answers: {
      action: {
        choice: "approach",
        probabilities: { approach: 0.62, avoid: 0.13, explore: 0.2, freeze: 0.05 },
        confidence: 0.62,
      },
      danger: { score: 1 },
    },
  }),
});

test("request shape: pinned model, one choice + one score question, normalized state", () => {
  const req = buildJevRequest(STATE, "jev-1.13.0");
  assert.equal(req.model, "jev-1.13.0");
  assert.deepEqual(req.state.signals, { food: 0.5, threat: 0.2, light: 0.1, novelty: 0.3 });
  assert.equal(req.state.time_left_s, 40);
  assert.equal(req.questions.action.type, "choice");
  assert.deepEqual(Object.keys(req.questions.action.criteria).sort(),
    ["approach", "avoid", "explore", "freeze"]);
  assert.equal(req.questions.danger.type, "score");
  assert.equal(Object.keys(req.questions.danger.levels).length, 4);
});

test("latest floating aliases are refused at construction", () => {
  assert.throws(() => createJevBrain({ apiKey: "k", model: "jev-latest" }), /pinned/);
  assert.equal(JEV_MODEL_DEFAULT, "jev-1.13.0");
});

test("default endpoint is the same-origin proxy", () => {
  assert.equal(JEV_ENDPOINT_DEFAULT, "/api/jev");
  const b = createJevBrain({ apiKey: "k", fetchFn: (async () => okResponse()) as unknown as typeof fetch });
  assert.equal(b.endpoint, "/api/jev");
});

test("happy path: maps answers, seals the record, measures latency", async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const fetchFn = (async (url: string, init: RequestInit) => {
    captured = { url, init };
    return okResponse();
  }) as unknown as typeof fetch;
  const brain = createJevBrain({ apiKey: "sk-test", fetchFn });
  const r = await brain.decide(STATE);
  assert.equal(captured!.url, "/api/jev");
  const headers = captured!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-test");
  const sent = JSON.parse(String(captured!.init.body));
  assert.equal(sent.model, "jev-1.13.0");
  assert.equal(r.behavior, "approach");
  assert.equal(r.confidence, 0.62);
  assert.equal(r.record.distribution.explore, 0.2);
  assert.equal(r.record.dangerScore, 1);
  assert.ok(r.record.latencyMs >= 0);
  assert.equal(
    r.record.contentHash,
    contentHash({ ...r.record, contentHash: undefined, latencyMs: undefined })
  );
  // second decision increments tick
  const r2 = await brain.decide(STATE);
  assert.equal(r2.record.tick, 1);
});

test("non-200 (including 529) throws — the driver handles fallback", async () => {
  const fetchFn = (async () => ({ ok: false, status: 529, json: async () => ({}) })) as unknown as typeof fetch;
  const brain = createJevBrain({ apiKey: "k", fetchFn });
  await assert.rejects(() => brain.decide(STATE), /jev 529/);
});

test("schema-valid but unknown option is rejected, never silently applied", async () => {
  const fetchFn = (async () => ({
    ok: true, status: 200,
    json: async () => ({ answers: { action: { choice: "hover", probabilities: { hover: 1 }, confidence: 1 }, danger: { score: 0 } } }),
  })) as unknown as typeof fetch;
  const brain = createJevBrain({ apiKey: "k", fetchFn });
  await assert.rejects(() => brain.decide(STATE), /unknown behavior/);
});

test("reset restores tick 0", async () => {
  const fetchFn = (async () => okResponse()) as unknown as typeof fetch;
  const brain = createJevBrain({ apiKey: "k", fetchFn });
  await brain.decide(STATE);
  await brain.decide(STATE);
  brain.reset!();
  const r = await brain.decide(STATE);
  assert.equal(r.record.tick, 0);
});
