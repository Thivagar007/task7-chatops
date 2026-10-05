// Tool tests - fetch and the managed-identity credential are mocked.
process.env.ADO_ORG_URL = "https://dev.azure.com/contoso";
process.env.ADO_PROJECT = "orders-api";
process.env.AZ_SUBSCRIPTION_ID = "sub-1";
process.env.TARGET_RESOURCE_GROUP = "rg-task7-target";
process.env.ALERT_RESOURCE_GROUPS = "rg-task7-target";
process.env.ALLOWED_APPS = "func-orders-svc-x";

jest.mock("../src/lib/credential", () => ({ getToken: jest.fn().mockResolvedValue("fake-token"), getCredential: jest.fn() }));

const { getPipelineStatus } = require("../src/tools/pipelineStatus");
const { getActiveAlerts } = require("../src/tools/activeAlerts");
const { getDeploymentHistory, versionFrom } = require("../src/tools/deploymentHistory");
const { validateRollback, executeRollback } = require("../src/tools/rollback");

function mockFetch(...responses) {
  global.fetch = jest.fn();
  for (const r of responses) {
    global.fetch.mockResolvedValueOnce({ ok: (r.status || 200) < 400, status: r.status || 200, text: async () => JSON.stringify(r.body ?? {}) });
  }
}

test("get_pipeline_status maps the latest build", async () => {
  mockFetch(
    { body: { value: [{ id: 7, name: "Thivagar007.orders-api-gitops" }] } },
    { body: { value: [{ status: "completed", result: "succeeded", buildNumber: "20261005.3", sourceBranch: "refs/heads/main",
                         requestedFor: { displayName: "Thivagar" }, sourceVersion: "abcdef123", queueTime: "2026-10-05T10:00:00Z" }] } }
  );
  const r = await getPipelineStatus({ pipeline_name: "orders-api" });
  expect(r).toMatchObject({ pipeline: "Thivagar007.orders-api-gitops", state: "succeeded", branch: "main", commit: "abcdef1" });
  expect(global.fetch.mock.calls[1][0]).toContain("definitions=7");
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer fake-token");
});

test("get_pipeline_status reports in-progress runs", async () => {
  mockFetch({ body: { value: [{ id: 1, name: "orders-api" }] } }, { body: { value: [{ status: "inProgress", buildNumber: "1" }] } });
  expect((await getPipelineStatus({ pipeline_name: "orders-api" })).state).toBe("in-progress");
});

test("get_active_alerts returns fired alerts with severity and time", async () => {
  mockFetch({ body: { value: [
    { properties: { essentials: { alertRule: "/x/alert-orders-svc-http5xx", severity: "Sev2", alertState: "New",
      monitorCondition: "Fired", targetResourceName: "func-orders-svc-x", startDateTime: "2026-10-05T10:00:00Z" } } },
    { properties: { essentials: { alertRule: "/x/old", severity: "Sev3", alertState: "Closed", monitorCondition: "Fired" } } },
  ] } });
  const r = await getActiveAlerts({ resource_group: "rg-task7-target" });
  expect(r.count).toBe(1);
  expect(r.alerts[0]).toMatchObject({ rule: "alert-orders-svc-http5xx", severity: "Sev2", firedAt: "2026-10-05T10:00:00Z" });
});

test("get_active_alerts refuses resource groups outside the allow-list", async () => {
  const r = await getActiveAlerts({ resource_group: "rg-prod-secret" });
  expect(r.error).toMatch(/not in the bot's allowed list/);
});

test("get_deployment_history merges slots, newest first, max 5", async () => {
  const dep = (v, t, active = false) => ({ properties: { message: `v${v} via pipeline`, status: 4, deployer: "azure-pipelines", author: "Thivagar", start_time: t, active } });
  mockFetch(
    { body: { value: [dep("1.1.0", "2026-10-05T10:00:00Z", true), dep("1.0.0", "2026-10-04T10:00:00Z")] } },
    { body: { value: [dep("1.2.0", "2026-10-05T11:00:00Z", true)] } }
  );
  const r = await getDeploymentHistory({ app_name: "func-orders-svc-x" });
  expect(r.deployments.map((d) => d.version)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
  expect(r.currentProduction).toBe("1.1.0");
  expect(r.deployments[0]).toMatchObject({ status: "succeeded", deployer: "azure-pipelines", slot: "staging" });
});

test("versionFrom extracts semantic versions", () => {
  expect(versionFrom("Release v2.3.4 by pipeline")).toBe("2.3.4");
  expect(versionFrom("no version")).toBeNull();
});

test("rollback validation enforces the allow-list and slot names", () => {
  expect(validateRollback({ app_name: "func-orders-svc-x" })).toMatchObject({ ok: true, slot: "staging" });
  expect(validateRollback({ app_name: "some-other-app" }).ok).toBe(false);
  expect(validateRollback({ app_name: "func-orders-svc-x", slot: "production" }).ok).toBe(false);
});

test("executeRollback calls the slot swap API", async () => {
  mockFetch({ status: 202, body: {} });
  const r = await executeRollback({ appName: "func-orders-svc-x", slot: "staging" });
  expect(r).toMatchObject({ accepted: true, from: "staging", to: "production" });
  expect(global.fetch.mock.calls[0][0]).toContain("/slots/staging/slotsswap");
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ targetSlot: "production", preserveVnet: true });
});
