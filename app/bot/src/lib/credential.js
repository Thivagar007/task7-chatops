const { DefaultAzureCredential } = require("@azure/identity");

// AZURE_CLIENT_ID selects the user-assigned identity in Azure;
// locally DefaultAzureCredential falls back to `az login`.
let credential;
function getCredential() {
  credential ??= new DefaultAzureCredential(
    process.env.AZURE_CLIENT_ID ? { managedIdentityClientId: process.env.AZURE_CLIENT_ID } : {}
  );
  return credential;
}

async function getToken(scope) {
  const t = await getCredential().getToken(scope);
  return t.token;
}

module.exports = { getCredential, getToken };
