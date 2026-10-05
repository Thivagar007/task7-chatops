const schema = require("./schema.json");
const { getPipelineStatus } = require("./pipelineStatus");
const { getActiveAlerts } = require("./activeAlerts");
const { getDeploymentHistory } = require("./deploymentHistory");
const { validateRollback, executeRollback } = require("./rollback");

// trigger_rollback is NOT in this map on purpose: the agent intercepts it and
// asks for confirmation; executeRollback runs only after the user replies YES.
const readTools = {
  get_pipeline_status: getPipelineStatus,
  get_active_alerts: getActiveAlerts,
  get_deployment_history: getDeploymentHistory,
};

module.exports = { schema, readTools, validateRollback, executeRollback };
