// All configuration comes from app settings (Terraform). No secrets here:
// every Azure call is authorised with the managed identity.
const env = process.env;

module.exports = {
  openai: {
    endpoint: (env.OPENAI_ENDPOINT || "").replace(/\/?$/, "/"),
    deployment: env.OPENAI_DEPLOYMENT || "gpt-4o",
    apiVersion: env.OPENAI_API_VERSION || "2024-10-21",
    maxToolRounds: 4,
  },
  ado: {
    orgUrl: (env.ADO_ORG_URL || "").replace(/\/$/, ""),
    project: env.ADO_PROJECT || "",
  },
  azure: {
    subscriptionId: env.AZ_SUBSCRIPTION_ID || "",
    alertResourceGroups: (env.ALERT_RESOURCE_GROUPS || "").split(",").map((s) => s.trim()).filter(Boolean),
    targetResourceGroup: env.TARGET_RESOURCE_GROUP || "",
    allowedApps: (env.ALLOWED_APPS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  },
  tableEndpoint: env.TABLE_ENDPOINT || "",
  rateLimitPerHour: parseInt(env.RATE_LIMIT_PER_HOUR || "20", 10),
  historyMaxMessages: parseInt(env.HISTORY_MAX_MESSAGES || "5", 10),
  pendingTtlMinutes: 5,
  slot: env.APP_SLOT || "local",
  version: env.APP_VERSION || "1.0.0",
};
