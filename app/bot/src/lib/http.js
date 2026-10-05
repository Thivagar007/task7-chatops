const { getToken } = require("./credential");

const SCOPES = {
  arm: "https://management.azure.com/.default",
  ado: "499b84ac-1321-427f-aa17-267ca6975798/.default", // Azure DevOps resource ID
  openai: "https://cognitiveservices.azure.com/.default",
};

class HttpError extends Error {
  constructor(status, body, url) {
    const detail = body && body.error ? ` - ${body.error.code || ""}: ${body.error.message || ""}`.slice(0, 300) : "";
    super(`HTTP ${status} from ${url.split("?")[0]}${detail}`);
    this.status = status;
    this.body = body;
  }
}

// fetch with an Entra ID bearer token for the given audience
async function authorizedFetch(audience, url, { method = "GET", body, headers = {} } = {}) {
  const token = await getToken(SCOPES[audience]);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new HttpError(res.status, json, url);
  return { status: res.status, json };
}

module.exports = { authorizedFetch, HttpError, SCOPES };
