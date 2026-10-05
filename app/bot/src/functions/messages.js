// POST /api/messages - Bot Framework endpoint (Teams, Web Chat).
// Anonymous at the Functions level: CloudAdapter validates the Bot Connector JWT.
const { app } = require("@azure/functions");
const {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} = require("botbuilder");
const { agent, telemetry } = require("../runtime");
const { ChatOpsBot } = require("../bot");

// MicrosoftAppType=UserAssignedMSI, MicrosoftAppId=<identity client id>, MicrosoftAppTenantId
// -> outbound replies are authorised with a managed-identity token (no app password)
const auth = new ConfigurationBotFrameworkAuthentication(process.env);
const adapter = new CloudAdapter(auth);
const bot = new ChatOpsBot(agent);

adapter.onTurnError = async (context, error) => {
  telemetry.exception(error, { source: "onTurnError" });
  await context.sendActivity("Sorry, the bot hit an error. Please try again.");
};

app.http("messages", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "messages",
  handler: async (request, context) => {
    // Adapt the Functions v4 request/response to what CloudAdapter.process expects
    const req = {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: await request.json(),
    };
    const res = {
      statusCode: 200, headers: {}, body: undefined,
      status(code) { this.statusCode = code; return this; },
      header(name, value) { this.headers[name] = value; return this; },
      send(body) { this.body = body; return this; },
      end() { return this; },
    };
    try {
      await adapter.process(req, res, (turnContext) => bot.run(turnContext));
    } finally {
      await telemetry.flush();
    }
    return typeof res.body === "object" && res.body !== null
      ? { status: res.statusCode, headers: res.headers, jsonBody: res.body }
      : { status: res.statusCode, headers: res.headers, body: res.body };
  },
});
