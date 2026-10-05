// =====================================================================
// The ChatOps agent - channel independent (used by Teams/Web Chat via the
// Bot Framework AND by the /api/chat smoke-test endpoint).
//
//   1. rate limit (20/user/hour)          4. OpenAI + function calling loop
//   2. pending rollback? YES -> execute    5. trigger_rollback -> ask "YES"
//   3. load last 5 messages (memory)       6. save memory + telemetry
// =====================================================================
const fs = require("fs");
const path = require("path");

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "prompt", "system-prompt.md"), "utf8");

function createAgent({ openai, tools, store, telemetry, config }) {
  const { ContentFilterError } = openai;

  async function runTool(name, args, ctx) {
    const started = Date.now();
    let success = true, result;
    try {
      result = await tools.readTools[name](args);
    } catch (err) {
      success = false;
      result = { error: `Tool failed: ${err.message}`, status: err.status };
      telemetry.exception(err, { tool: name, userId: ctx.userKey });
    }
    telemetry.event("ToolCall", { tool: name, success: String(success), userId: ctx.userKey }, { durationMs: Date.now() - started });
    return result;
  }

  async function confirmPending(pending, text, ctx) {
    await store.clearPending(ctx.conversationId);
    if (new Date(pending.expiresAt) < new Date()) {
      return null; // expired - treat the message normally
    }
    if (text.trim().toUpperCase() !== "YES") {
      telemetry.event("RollbackCancelled", { app: pending.appName, userId: ctx.userKey });
      return { reply: `Rollback of **${pending.appName}** cancelled - nothing was changed.`, toolCalls: [] };
    }
    const started = Date.now();
    try {
      const r = await tools.executeRollback(pending);
      telemetry.event("ToolCall", { tool: "trigger_rollback", success: "true", userId: ctx.userKey }, { durationMs: Date.now() - started });
      telemetry.event("RollbackConfirmed", { app: pending.appName, slot: pending.slot, userId: ctx.userKey });
      return {
        reply:
          `✅ Rollback started: swapping **${r.from} → ${r.to}** on **${r.app}** (HTTP ${r.httpStatus}).\n\n` +
          `The swap warms up the slot first and usually completes in 1-2 minutes. ` +
          `Ask me for the deployment history of ${r.app} to verify.`,
        toolCalls: ["trigger_rollback"],
      };
    } catch (err) {
      telemetry.event("ToolCall", { tool: "trigger_rollback", success: "false", userId: ctx.userKey }, { durationMs: Date.now() - started });
      telemetry.exception(err, { tool: "trigger_rollback" });
      return { reply: `❌ Rollback of ${pending.appName} failed: ${err.message}`, toolCalls: ["trigger_rollback"] };
    }
  }

  async function handle({ userId, conversationId, text, channel = "unknown" }) {
    const started = Date.now();
    const ctx = { userKey: telemetry.anonymize(userId), conversationId };
    const usage = { prompt: 0, completion: 0 };
    let toolCalls = [], outcome = "ok";

    try {
      // 1. Rate limit
      const rl = await store.hitRateLimit(ctx.userKey, config.rateLimitPerHour);
      if (!rl.allowed) {
        outcome = "rate_limited";
        telemetry.event("RateLimited", { userId: ctx.userKey, channel });
        return { reply: `You have reached the limit of ${config.rateLimitPerHour} requests per hour. Please try again later.`, toolCalls, outcome };
      }

      // 2. A rollback waiting for confirmation?
      const pending = await store.getPending(conversationId);
      if (pending) {
        const r = await confirmPending(pending, text, ctx);
        if (r) {
          toolCalls = r.toolCalls;
          await store.appendHistory(conversationId, [{ role: "user", content: text }, { role: "assistant", content: r.reply }], config.historyMaxMessages);
          return { ...r, outcome: "confirmation" };
        }
      }

      // 3. Memory: last N messages of this conversation
      const history = await store.loadHistory(conversationId, config.historyMaxMessages);
      const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history, { role: "user", content: text }];

      // 4. Function-calling loop
      let reply = null;
      for (let round = 0; round < config.openai.maxToolRounds && reply === null; round++) {
        const { message, usage: u, model } = await openai.chat(messages, tools.schema);
        usage.prompt += u.prompt_tokens || 0;
        usage.completion += u.completion_tokens || 0;
        telemetry.event("OpenAITokens", { model: model || config.openai.deployment, userId: ctx.userKey },
          { promptTokens: u.prompt_tokens || 0, completionTokens: u.completion_tokens || 0, totalTokens: u.total_tokens || 0 });

        const calls = message.tool_calls || [];
        if (!calls.length) { reply = message.content || ""; break; }
        messages.push({ role: "assistant", content: message.content || null, tool_calls: calls });

        for (const call of calls) {
          const name = call.function.name;
          let args = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* keep {} */ }
          toolCalls.push(name);

          // 5. Destructive tool -> never executed here; ask for explicit YES
          if (name === "trigger_rollback") {
            const v = tools.validateRollback(args);
            if (!v.ok) {
              messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(v) });
              continue;
            }
            const expiresAt = new Date(Date.now() + config.pendingTtlMinutes * 60000).toISOString();
            await store.setPending(conversationId, { appName: v.appName, slot: v.slot, expiresAt });
            telemetry.event("RollbackRequested", { app: v.appName, slot: v.slot, userId: ctx.userKey });
            reply =
              `⚠️ **Are you sure?** This will swap **${v.slot} → production** on **${v.appName}**.\n\n` +
              `Reply **YES** to confirm (valid for ${config.pendingTtlMinutes} minutes). Any other reply cancels.`;
            break;
          }

          const result = tools.readTools[name]
            ? await runTool(name, args, ctx)
            : { error: `Unknown tool ${name}` };
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
        }
      }
      if (reply === null) reply = "Sorry, I could not complete that request. Please try rephrasing it.";

      // 6. Memory (user + final answer only; tool payloads are not stored)
      await store.appendHistory(conversationId, [{ role: "user", content: text }, { role: "assistant", content: reply }], config.historyMaxMessages);
      return { reply, toolCalls, usage, outcome };
    } catch (err) {
      if (err instanceof ContentFilterError) {
        outcome = "content_filtered";
        // anonymised user id + prompt category (the filter categories that triggered)
        telemetry.event("ContentFiltered", {
          userId: ctx.userKey, source: err.source, category: err.categories.join(",") || "unknown", channel,
        });
        return { reply: "Sorry, I can't help with that request. I can answer questions about DevOps and Azure infrastructure.", toolCalls, outcome };
      }
      outcome = "error";
      telemetry.exception(err, { userId: ctx.userKey, channel });
      return { reply: "Sorry, something went wrong while processing your request. Please try again.", toolCalls, outcome };
    } finally {
      telemetry.event("BotRequest", {
        userId: ctx.userKey, conversation: telemetry.anonymize(conversationId), channel, outcome,
        tools: toolCalls.join(","), success: String(outcome !== "error"),
      }, { durationMs: Date.now() - started, toolCount: toolCalls.length, promptTokens: usage.prompt, completionTokens: usage.completion });
    }
  }

  return { handle };
}

module.exports = { createAgent, SYSTEM_PROMPT };
