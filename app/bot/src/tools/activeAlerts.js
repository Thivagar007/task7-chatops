// Tool 2 - get_active_alerts: fired Azure Monitor alerts in a resource group
// Auth: managed identity with Monitoring Reader on the allowed resource groups.
//
// Primary source : Alerts Management REST API at resource-group scope.
// Fallback       : Azure Resource Graph (alertsmanagementresources table), which
//                  honours resource-group level RBAC and works on every tenant.
const config = require("../lib/config");
const { authorizedFetch, HttpError } = require("../lib/http");

async function fromAlertsApi(rg) {
  const scope = `/subscriptions/${config.azure.subscriptionId}/resourceGroups/${rg}`;
  const url =
    `https://management.azure.com${scope}/providers/Microsoft.AlertsManagement/alerts` +
    `?api-version=2023-07-12-preview&monitorCondition=Fired&timeRange=1d`;
  const { json } = await authorizedFetch("arm", url);
  return json.value || [];
}

async function fromResourceGraph(rg) {
  const query =
    "alertsmanagementresources " +
    "| where type =~ 'microsoft.alertsmanagement/alerts' " +
    `| where tostring(properties.essentials.targetResourceGroup) =~ '${rg.replace(/'/g, "")}' ` +
    "| where tostring(properties.essentials.monitorCondition) == 'Fired' " +
    "| where todatetime(properties.essentials.startDateTime) > ago(1d) " +
    "| project properties";
  const { json } = await authorizedFetch(
    "arm",
    "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01",
    { method: "POST", body: { subscriptions: [config.azure.subscriptionId], query, options: { resultFormat: "objectArray" } } }
  );
  return json.data || [];
}

async function getActiveAlerts({ resource_group }) {
  const rg = resource_group || config.azure.targetResourceGroup;
  const allowed = config.azure.alertResourceGroups.map((r) => r.toLowerCase());
  if (allowed.length && !allowed.includes(rg.toLowerCase())) {
    return { error: `Resource group '${rg}' is not in the bot's allowed list`, allowed: config.azure.alertResourceGroups };
  }

  let raw, source = "alerts-api";
  try {
    raw = await fromAlertsApi(rg);
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    source = "resource-graph";
    raw = await fromResourceGraph(rg); // throws (with details) if this also fails
  }

  const alerts = raw
    .map((a) => a.properties?.essentials || {})
    .filter((e) => e.alertState !== "Closed" && (e.monitorCondition || "Fired") === "Fired")
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

  return { resourceGroup: rg, count: alerts.length, alerts, source };
}

module.exports = { getActiveAlerts };
