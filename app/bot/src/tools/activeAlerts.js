// Tool 2 - get_active_alerts: fired Azure Monitor alerts in a resource group
// Auth: managed identity with Monitoring Reader on the allowed resource groups.
const config = require("../lib/config");
const { authorizedFetch } = require("../lib/http");

async function getActiveAlerts({ resource_group }) {
  const rg = resource_group || config.azure.targetResourceGroup;
  const allowed = config.azure.alertResourceGroups.map((r) => r.toLowerCase());
  if (allowed.length && !allowed.includes(rg.toLowerCase())) {
    return { error: `Resource group '${rg}' is not in the bot's allowed list`, allowed: config.azure.alertResourceGroups };
  }
  const scope = `/subscriptions/${config.azure.subscriptionId}/resourceGroups/${rg}`;
  const url =
    `https://management.azure.com${scope}/providers/Microsoft.AlertsManagement/alerts` +
    `?api-version=2023-07-12-preview&monitorCondition=Fired&timeRange=1d`;
  const { json } = await authorizedFetch("arm", url);

  const alerts = (json.value || [])
    .map((a) => a.properties?.essentials || {})
    .filter((e) => e.alertState !== "Closed")
    .map((e) => ({
      rule: (e.alertRule || "").split("/").pop(),
      severity: e.severity, // Sev0 (critical) .. Sev4 (verbose)
      state: e.alertState,
      condition: e.monitorCondition,
      target: e.targetResourceName,
      firedAt: e.startDateTime,
      description: e.description,
    }))
    .sort((a, b) => (a.severity || "").localeCompare(b.severity || ""));

  return { resourceGroup: rg, count: alerts.length, alerts };
}

module.exports = { getActiveAlerts };
