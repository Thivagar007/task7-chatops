// Tool 4 - trigger_rollback: swap <slot> -> production (only after the user replied YES)
const config = require("../lib/config");
const { authorizedFetch } = require("../lib/http");

function validateRollback({ app_name, slot = "staging" }) {
  const app = String(app_name || "").trim();
  if (!config.azure.allowedApps.includes(app.toLowerCase())) {
    return { ok: false, error: `App '${app}' is not in the rollback allow-list`, managedApps: config.azure.allowedApps };
  }
  if (!/^[a-z0-9-]{1,40}$/i.test(slot) || slot === "production") {
    return { ok: false, error: `Invalid source slot '${slot}'` };
  }
  return { ok: true, appName: app, slot };
}

async function executeRollback({ appName, slot }) {
  const url =
    `https://management.azure.com/subscriptions/${config.azure.subscriptionId}/resourceGroups/${config.azure.targetResourceGroup}` +
    `/providers/Microsoft.Web/sites/${appName}/slots/${slot}/slotsswap?api-version=2023-12-01`;
  const { status } = await authorizedFetch("arm", url, {
    method: "POST",
    body: { targetSlot: "production", preserveVnet: true },
  });
  return { accepted: status === 200 || status === 202, app: appName, from: slot, to: "production", httpStatus: status };
}

module.exports = { validateRollback, executeRollback };
