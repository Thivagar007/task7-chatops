// POST /api/chat - same agent, plain JSON in/out. Protected by a function key.
// Used by the CI/CD smoke test (staging slot) and for scripted testing.
const { app } = require("@azure/functions");
const { agent, telemetry } = require("../runtime");

app.http("chat", {
  methods: ["POST"],
  authLevel: "function",
  route: "chat",
  handler: async (request) => {
    let body;
    try { body = await request.json(); } catch { body = {}; }
    if (!body.message) return { status: 400, jsonBody: { error: "message is required" } };

    const result = await agent.handle({
      userId: body.userId || "smoke-test",
      conversationId: body.conversationId || `api-${body.userId || "smoke-test"}`,
      text: String(body.message).slice(0, 4000),
      channel: "api",
    });
    await telemetry.flush();
    return { status: 200, jsonBody: { reply: result.reply, toolCalls: result.toolCalls, outcome: result.outcome, usage: result.usage } };
  },
});
