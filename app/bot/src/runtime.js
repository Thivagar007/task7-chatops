// Wires the real dependencies (used by the Azure Functions entry points)
const config = require("./lib/config");
const openai = require("./lib/openai");
const telemetry = require("./lib/telemetry");
const { createStore } = require("./lib/store");
const tools = require("./tools");
const { createAgent } = require("./agent");

const store = createStore(config.tableEndpoint);
const agent = createAgent({ openai, tools, store, telemetry, config });

module.exports = { agent, store, telemetry, config };
