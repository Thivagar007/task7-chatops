// Timer (hourly) - TTL clean-up for Table Storage: expired rate-limit
// windows, expired rollback confirmations and week-old conversation history.
const { app } = require("@azure/functions");
const { store } = require("../runtime");

app.timer("cleanup", {
  schedule: "0 5 * * * *",
  handler: async (timer, context) => {
    const removed = await store.purgeExpired();
    context.log(`TTL cleanup removed ${removed} expired rows`);
  },
});
