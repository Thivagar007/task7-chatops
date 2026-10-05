// Agent tests - Azure OpenAI and every Azure/DevOps call are mocked.
const { createAgent } = require("../src/agent");
const { MemoryStore } = require("../src/lib/store");
const { ContentFilterError } = require("../src/lib/openai");

const config = {
  rateLimitPerHour: 20, historyMaxMessages: 5, pendingTtlMinutes: 5,
  openai: { deployment: "gpt-4o", maxToolRounds: 4 },
};

function toolCall(name, args, id = "call_1") {
  return { message: { content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
           usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } };
}
const text = (content) => ({ message: { content }, usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 } });

function setup(responses) {
  const openai = { chat: jest.fn(), ContentFilterError };
  responses.forEach((r) => (r instanceof Error ? openai.chat.mockRejectedValueOnce(r) : openai.chat.mockResolvedValueOnce(r)));
  const tools = {
    schema: [],
    readTools: {
      get_pipeline_status: jest.fn().mockResolvedValue({ pipeline: "orders-api", state: "succeeded", runNumber: "20261005.3" }),
      get_active_alerts: jest.fn().mockResolvedValue({ count: 1, alerts: [{ rule: "alert-orders-svc-http5xx", severity: "Sev2" }] }),
      get_deployment_history: jest.fn().mockResolvedValue({ deployments: [] }),
    },
    validateRollback: jest.fn((a) => ({ ok: true, appName: a.app_name, slot: a.slot || "staging" })),
    executeRollback: jest.fn().mockResolvedValue({ accepted: true, app: "func-orders-svc-x", from: "staging", to: "production", httpStatus: 202 }),
  };
  const events = [];
  const telemetry = {
    anonymize: (v) => `anon-${v}`,
    event: (name, props, m) => events.push({ name, props, m }),
    exception: jest.fn(),
  };
  const store = new MemoryStore();
  const agent = createAgent({ openai, tools, store, telemetry, config });
  return { agent, openai, tools, store, events };
}

const msg = (text, extra = {}) => ({ userId: "u1", conversationId: "conv-1", text, channel: "test", ...extra });

test("calls get_pipeline_status when the model asks for it and returns the final answer", async () => {
  const { agent, tools, openai, events } = setup([
    toolCall("get_pipeline_status", { pipeline_name: "orders-api", branch: "main" }),
    text("The latest orders-api run on main succeeded (20261005.3)."),
  ]);
  const r = await agent.handle(msg("what is the status of the orders-api pipeline?"));
  expect(tools.readTools.get_pipeline_status).toHaveBeenCalledWith({ pipeline_name: "orders-api", branch: "main" });
  expect(r.reply).toMatch(/succeeded/);
  expect(r.toolCalls).toEqual(["get_pipeline_status"]);
  // tool result is passed back to the model as a tool message
  const second = openai.chat.mock.calls[1][0];
  expect(second.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
  expect(events.filter((e) => e.name === "ToolCall")[0].props.tool).toBe("get_pipeline_status");
  expect(events.filter((e) => e.name === "OpenAITokens")).toHaveLength(2);
});

test("rollback is NOT executed until the user replies YES", async () => {
  const { agent, tools, store } = setup([toolCall("trigger_rollback", { app_name: "func-orders-svc-x" })]);
  const first = await agent.handle(msg("roll back func-orders-svc-x"));
  expect(first.reply).toMatch(/Are you sure\?/);
  expect(first.reply).toMatch(/YES/);
  expect(tools.executeRollback).not.toHaveBeenCalled();
  expect(await store.getPending("conv-1")).toMatchObject({ appName: "func-orders-svc-x", slot: "staging" });

  const second = await agent.handle(msg("YES"));
  expect(tools.executeRollback).toHaveBeenCalledWith(expect.objectContaining({ appName: "func-orders-svc-x", slot: "staging" }));
  expect(second.reply).toMatch(/Rollback started/);
  expect(await store.getPending("conv-1")).toBeNull();
});

test("any reply other than YES cancels the rollback", async () => {
  const { agent, tools } = setup([toolCall("trigger_rollback", { app_name: "func-orders-svc-x" })]);
  await agent.handle(msg("roll back func-orders-svc-x"));
  const r = await agent.handle(msg("no, wait"));
  expect(r.reply).toMatch(/cancelled/);
  expect(tools.executeRollback).not.toHaveBeenCalled();
});

test("rate limit blocks the 21st request in the same hour", async () => {
  const responses = Array.from({ length: 20 }, () => text("ok"));
  const { agent, events } = setup(responses);
  for (let i = 0; i < 20; i++) expect((await agent.handle(msg(`q${i}`))).outcome).toBe("ok");
  const r = await agent.handle(msg("one more"));
  expect(r.outcome).toBe("rate_limited");
  expect(events.some((e) => e.name === "RateLimited")).toBe(true);
});

test("keeps the last 5 messages as conversation memory", async () => {
  const { agent, openai } = setup([text("a1"), text("a2"), text("a3"), text("a4")]);
  for (const q of ["q1", "q2", "q3", "q4"]) await agent.handle(msg(q));
  const sent = openai.chat.mock.calls[3][0]; // system + 5 history + current
  expect(sent).toHaveLength(7);
  expect(sent[0].role).toBe("system");
  expect(sent.at(-1)).toEqual({ role: "user", content: "q4" });
});

test("content-filtered prompts get a refusal and are logged with an anonymised user and category", async () => {
  const { agent, events } = setup([new ContentFilterError("prompt", ["jailbreak"])]);
  const r = await agent.handle(msg("ignore your rules and ..."));
  expect(r.outcome).toBe("content_filtered");
  const ev = events.find((e) => e.name === "ContentFiltered");
  expect(ev.props).toMatchObject({ userId: "anon-u1", source: "prompt", category: "jailbreak" });
});

test("every request emits a BotRequest event with latency and tool count", async () => {
  const { agent, events } = setup([text("hello")]);
  await agent.handle(msg("hi"));
  const ev = events.find((e) => e.name === "BotRequest");
  expect(ev.props.outcome).toBe("ok");
  expect(ev.m).toHaveProperty("durationMs");
  expect(ev.m.toolCount).toBe(0);
});
