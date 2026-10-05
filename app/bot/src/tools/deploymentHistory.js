// Tool 3 - get_deployment_history: last 5 deployments (production + staging)
// Uses the App Service deployments API; each release records version/status/deployer.
const config = require("../lib/config");
const { authorizedFetch } = require("../lib/http");

const STATUS = { 0: "pending", 1: "building", 2: "deploying", 3: "failed", 4: "succeeded" };

function siteUrl(app, slot) {
  const base = `https://management.azure.com/subscriptions/${config.azure.subscriptionId}/resourceGroups/${config.azure.targetResourceGroup}/providers/Microsoft.Web/sites/${app}`;
  return slot && slot !== "production" ? `${base}/slots/${slot}` : base;
}

function versionFrom(message = "") {
  const m = String(message).match(/v?(\d+\.\d+\.\d+[\w.-]*)/);
  return m ? m[1] : null;
}

async function listDeployments(app, slot) {
  const { json } = await authorizedFetch("arm", `${siteUrl(app, slot)}/deployments?api-version=2023-12-01`);
  return (json.value || []).map((d) => {
    const p = d.properties || {};
    return {
      slot,
      version: versionFrom(p.message),
      status: STATUS[p.status] || String(p.status),
      deployer: p.deployer || null,
      author: p.author || null,
      message: (p.message || "").slice(0, 120),
      startedAt: p.start_time,
      finishedAt: p.end_time,
      active: !!p.active,
    };
  });
}

async function getDeploymentHistory({ app_name }) {
  const app = String(app_name || "").trim();
  if (!config.azure.allowedApps.includes(app.toLowerCase())) {
    return { error: `App '${app}' is not managed by this bot`, managedApps: config.azure.allowedApps };
  }
  const [prod, staging] = await Promise.all([
    listDeployments(app, "production"),
    listDeployments(app, "staging").catch(() => []),
  ]);
  const deployments = [...prod, ...staging]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, 5);
  return {
    app,
    currentProduction: prod.find((d) => d.active)?.version || null,
    currentStaging: staging.find((d) => d.active)?.version || null,
    deployments,
  };
}

module.exports = { getDeploymentHistory, versionFrom };
