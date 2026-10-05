// GET /api/health - liveness + which slot/version is serving
const { app } = require("@azure/functions");
const { config } = require("../runtime");

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => ({
    status: 200,
    jsonBody: { status: "healthy", service: "chatops-bot", slot: config.slot, version: config.version, time: new Date().toISOString() },
  }),
});
