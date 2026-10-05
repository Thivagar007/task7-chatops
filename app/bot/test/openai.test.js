process.env.OPENAI_ENDPOINT = "https://oai.example.com/";
jest.mock("../src/lib/credential", () => ({ getToken: jest.fn().mockResolvedValue("mi-token"), getCredential: jest.fn() }));
const { chat, ContentFilterError, filteredCategories } = require("../src/lib/openai");

const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

test("sends a bearer token (no api-key header) and returns message + usage", async () => {
  global.fetch = jest.fn().mockResolvedValue(reply(200, { model: "gpt-4o", choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { total_tokens: 5 } }));
  const r = await chat([{ role: "user", content: "hello" }], []);
  expect(r.message.content).toBe("hi");
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toContain("/openai/deployments/gpt-4o/chat/completions");
  expect(opts.headers.Authorization).toBe("Bearer mi-token");
  expect(opts.headers["api-key"]).toBeUndefined();
});

test("prompt blocked by the content filter -> ContentFilterError(prompt)", async () => {
  global.fetch = jest.fn().mockResolvedValue(reply(400, { error: { code: "content_filter",
    innererror: { content_filter_result: { jailbreak: { filtered: true, detected: true }, hate: { filtered: false, severity: "safe" } } } } }));
  await expect(chat([], [])).rejects.toMatchObject({ source: "prompt", categories: ["jailbreak"] });
});

test("completion filtered -> ContentFilterError(completion)", async () => {
  global.fetch = jest.fn().mockResolvedValue(reply(200, { choices: [{ finish_reason: "content_filter",
    content_filter_results: { violence: { filtered: true, severity: "medium" } } }] }));
  const err = await chat([], []).catch((e) => e);
  expect(err).toBeInstanceOf(ContentFilterError);
  expect(err.categories).toEqual(["violence:medium"]);
});

test("filteredCategories ignores safe categories", () => {
  expect(filteredCategories({ hate: { filtered: false, severity: "safe" } })).toEqual([]);
});
