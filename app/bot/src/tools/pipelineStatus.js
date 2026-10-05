// Tool 1 - get_pipeline_status: latest Azure DevOps run for a pipeline + branch
// Auth: managed identity token for Azure DevOps (identity added to the org as a user).
const config = require("../lib/config");
const { authorizedFetch } = require("../lib/http");

async function getPipelineStatus({ pipeline_name, branch = "main", project }) {
  const org = config.ado.orgUrl;
  const proj = encodeURIComponent(project || config.ado.project);
  const { json: defs } = await authorizedFetch("ado", `${org}/${proj}/_apis/build/definitions?api-version=7.1`);
  const wanted = String(pipeline_name || "").toLowerCase();
  const def =
    defs.value.find((d) => d.name.toLowerCase() === wanted) ||
    defs.value.find((d) => d.name.toLowerCase().includes(wanted));
  if (!def) {
    return { found: false, message: `No pipeline matching '${pipeline_name}'`, available: defs.value.map((d) => d.name) };
  }

  const ref = branch.startsWith("refs/") ? branch : `refs/heads/${branch}`;
  const { json: builds } = await authorizedFetch(
    "ado",
    `${org}/${proj}/_apis/build/builds?definitions=${def.id}&branchName=${encodeURIComponent(ref)}&$top=1&queryOrder=queueTimeDescending&api-version=7.1`
  );
  const b = builds.value?.[0];
  if (!b) return { found: true, pipeline: def.name, branch, message: "No runs on this branch yet" };

  // status: notStarted | inProgress | completed ; result: succeeded | failed | canceled | partiallySucceeded
  const state = b.status === "completed" ? b.result : b.status === "inProgress" ? "in-progress" : b.status;
  return {
    found: true,
    pipeline: def.name,
    branch: (b.sourceBranch || ref).replace("refs/heads/", ""),
    state,
    runNumber: b.buildNumber,
    reason: b.reason,
    requestedFor: b.requestedFor?.displayName,
    commit: (b.sourceVersion || "").slice(0, 7),
    queuedAt: b.queueTime,
    finishedAt: b.finishTime || null,
    url: b._links?.web?.href,
  };
}

module.exports = { getPipelineStatus };
