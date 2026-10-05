// Custom Application Insights telemetry used by the dashboard:
//   BotRequest, ToolCall, OpenAITokens, ContentFiltered, RateLimited, Rollback*
const crypto = require("crypto");
const appInsights = require("applicationinsights");

const conn = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
const client = conn ? new appInsights.TelemetryClient(conn) : null;
const slot = process.env.APP_SLOT || "local";

// Anonymised, stable user / conversation id (no raw Teams IDs or names in telemetry)
function anonymize(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function event(name, properties = {}, measurements = {}) {
  if (!client) return;
  client.trackEvent({ name, properties: { slot, ...properties }, measurements });
}

function exception(error, properties = {}) {
  if (!client) return;
  client.trackException({ exception: error, properties: { slot, ...properties } });
}

function flush() {
  return new Promise((resolve) => (client ? client.flush({ callback: () => resolve() }) : resolve()));
}

module.exports = { anonymize, event, exception, flush };
