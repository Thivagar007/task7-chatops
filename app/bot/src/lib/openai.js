// Azure OpenAI Chat Completions over REST with a managed-identity token
// (the account has local auth disabled, so there is no key to use).
const config = require("./config");
const { authorizedFetch, HttpError } = require("./http");

class ContentFilterError extends Error {
  constructor(source, categories) {
    super(`Content filtered (${source}): ${categories.join(", ") || "unknown"}`);
    this.source = source; // "prompt" | "completion"
    this.categories = categories;
  }
}

// e.g. { hate: { filtered: true, severity: "medium" }, jailbreak: { filtered: true, detected: true } }
function filteredCategories(result = {}) {
  return Object.entries(result)
    .filter(([, v]) => v && (v.filtered || v.detected))
    .map(([k, v]) => (v.severity ? `${k}:${v.severity}` : k));
}

async function chat(messages, tools) {
  const { endpoint, deployment, apiVersion } = config.openai;
  const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  try {
    const { json } = await authorizedFetch("openai", url, {
      method: "POST",
      body: { messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 700 },
    });
    const choice = json.choices?.[0] || {};
    if (choice.finish_reason === "content_filter") {
      throw new ContentFilterError("completion", filteredCategories(choice.content_filter_results));
    }
    return { message: choice.message, usage: json.usage || {}, model: json.model };
  } catch (err) {
    // Prompt blocked by the content filter: HTTP 400, code content_filter
    if (err instanceof HttpError && err.status === 400 && err.body?.error?.code === "content_filter") {
      const inner = err.body.error.innererror?.content_filter_result;
      throw new ContentFilterError("prompt", filteredCategories(inner));
    }
    throw err;
  }
}

module.exports = { chat, ContentFilterError, filteredCategories };
