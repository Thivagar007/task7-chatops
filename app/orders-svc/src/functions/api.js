// orders-svc - the "service X" the ChatOps bot reports on and rolls back.
// release.json is written by scripts/deploy-target.ps1 and travels WITH the
// code, so a slot swap moves the version (and a bad release) between slots.
const { app } = require("@azure/functions");
const path = require("path");
const fs = require("fs");

function release() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "release.json"), "utf8")); }
  catch { return { version: "0.0.0", broken: false }; }
}

app.http("health", {
  methods: ["GET"], authLevel: "anonymous", route: "health",
  handler: async () => {
    const r = release();
    return { status: 200, jsonBody: { service: "orders-svc", version: r.version, slot: process.env.APP_SLOT || "local", broken: r.broken } };
  },
});

app.http("orders", {
  methods: ["GET"], authLevel: "anonymous", route: "orders",
  handler: async () => {
    const r = release();
    if (r.broken) {
      return { status: 500, jsonBody: { error: "orders database connection failed", version: r.version } };
    }
    return { status: 200, jsonBody: { version: r.version, orders: [{ id: 1, item: "keyboard" }, { id: 2, item: "monitor" }] } };
  },
});
