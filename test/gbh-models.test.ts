import assert from "node:assert/strict";
import test from "node:test";
import { modelCatalog, modelOf, selectModel, statsOf } from "../src/gbh/remote.ts";
import { readTranscript } from "../src/gbh/transcript.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";

/**
 * B2 (model picker) and B3 (older pages). The catalog shape was read off the running kernel:
 * {default:{provider,model}, groups:[{id,name,models:[{id,name,reasoning:{efforts:[{id}]}}]}]}.
 */
const HOST = parseReadyUrl("http://127.0.0.1:5439/?token=x")!;
const KERNEL = { host: HOST, cookie: "dsh-auth-fixture" };

/** A fetch double that answers with the given value and records the envelope. */
function answerWith(value: unknown) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ method: body.method, args: body.payload?.args ?? {} });
    return new Response(JSON.stringify({ type: "server-response", rpcId: "r", result: { ok: true, value } }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("the session's model comes from modelSelection.next, else lastUsed", () => {
  assert.deepEqual(modelOf({ modelSelection: { next: { provider: "auto", model: "deepseek-v4.1-flash" } } }), { provider: "auto", model: "deepseek-v4.1-flash" });
  assert.deepEqual(modelOf({ modelSelection: { next: null, lastUsed: { provider: "p", model: "m" } } }), { provider: "p", model: "m" });
  assert.equal(modelOf({}), undefined);
});

test("the catalog flattens into choices with efforts, and keeps the kernel default", async () => {
  const { calls, fetchImpl } = answerWith({
    default: { provider: "auto", model: "deepseek-v4.1-flash" },
    groups: [
      {
        id: "auto",
        name: "Galaxy Blackhole",
        models: [{ id: "deepseek-v4.1-flash", name: "Auto", reasoning: { efforts: [{ id: "off" }, { id: "high" }] } }],
      },
    ],
  });
  const catalog = await modelCatalog(KERNEL, fetchImpl);
  assert.deepEqual(calls[0], { method: "session.modelCatalog", args: {} });
  assert.equal(catalog.choices.length, 1);
  assert.deepEqual(catalog.choices[0], { provider: "auto", providerName: "Galaxy Blackhole", model: "deepseek-v4.1-flash", name: "Auto", efforts: ["off", "high"] });
  assert.deepEqual(catalog.defaultChoice, { provider: "auto", model: "deepseek-v4.1-flash" });
});

test("selecting a model sends provider, model and the optional effort", async () => {
  const { calls, fetchImpl } = answerWith(null);
  await selectModel(KERNEL, { sessionId: "s1", provider: "auto", model: "m", reasoningEffort: "high" }, fetchImpl);
  assert.deepEqual(calls[0], { method: "session.selectModel", args: { request: { sessionId: "s1", provider: "auto", model: "m", reasoningEffort: "high" } } });
});

test("an older page carries beforeSeq, and the transcript reports its oldest sequence", async () => {
  const calls: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.method === "session.list") {
      return new Response(
        JSON.stringify({
          type: "server-response",
          rpcId: "r",
          result: { ok: true, value: { items: [{ sessionId: "s1", projections: { asOfSeq: 9, values: { title: "A", modelSelection: { next: { provider: "auto", model: "m" } } } } }] } },
        }),
        { status: 200 },
      );
    }
    calls.push(body.payload.args);
    return new Response(
      JSON.stringify({
        type: "server-response",
        rpcId: "r",
        result: {
          ok: true,
          value: {
            hasMore: true,
            records: [{ type: "event", event: { type: "user/message", seq: 4, data: { role: "user", content: [{ type: "text", text: "cũ" }] } } }],
          },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const transcript = await readTranscript(KERNEL, "s1", 20, fetchImpl, 4);
  assert.equal((calls[0] as { request: { beforeSeq: number } }).request.beforeSeq, 4);
  assert.equal(transcript.firstSeq, 4);
  assert.equal(transcript.hasMore, true);
  assert.deepEqual(transcript.model, { provider: "auto", model: "m" });
});

test("turn counters come from sessionStats and are dropped when missing", () => {
  assert.deepEqual(statsOf({ sessionStats: { turns: 3, steps: 7 } }), { turns: 3, steps: 7 });
  assert.equal(statsOf({ sessionStats: { turns: 3 } }), undefined);
  assert.equal(statsOf({}), undefined);
});
