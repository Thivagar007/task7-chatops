# =====================================================================
# Azure OpenAI: account + gpt-4o-mini deployment + content filter policy
#
#  - local_auth_enabled = false  -> API KEYS ARE DISABLED. Only Entra ID
#    tokens work, so the Function App must use its managed identity.
#  - Custom RAI (content filter) policy attached to the deployment.
# =====================================================================

resource "azurerm_cognitive_account" "this" {
  name                          = var.name
  location                      = var.location
  resource_group_name           = var.resource_group_name
  kind                          = "OpenAI"
  sku_name                      = "S0"
  custom_subdomain_name         = var.name # required for Entra ID (token) auth
  local_auth_enabled            = false    # no API keys
  public_network_access_enabled = true
  tags                          = var.tags
}

# Content filters (Azure AI Content Safety) - block medium+ harm on both the
# prompt and the completion, block jailbreak attempts and protected material.
resource "azapi_resource" "content_filter" {
  type      = "Microsoft.CognitiveServices/accounts/raiPolicies@2024-10-01"
  name      = "chatops-content-filter"
  parent_id = azurerm_cognitive_account.this.id

  body = {
    properties = {
      basePolicyName = "Microsoft.DefaultV2"
      mode           = "Blocking"
      contentFilters = [
        { name = "Hate", enabled = true, blocking = true, severityThreshold = "Medium", source = "Prompt" },
        { name = "Sexual", enabled = true, blocking = true, severityThreshold = "Medium", source = "Prompt" },
        { name = "Violence", enabled = true, blocking = true, severityThreshold = "Medium", source = "Prompt" },
        { name = "Selfharm", enabled = true, blocking = true, severityThreshold = "Medium", source = "Prompt" },
        { name = "Jailbreak", enabled = true, blocking = true, source = "Prompt" },
        { name = "Hate", enabled = true, blocking = true, severityThreshold = "Medium", source = "Completion" },
        { name = "Sexual", enabled = true, blocking = true, severityThreshold = "Medium", source = "Completion" },
        { name = "Violence", enabled = true, blocking = true, severityThreshold = "Medium", source = "Completion" },
        { name = "Selfharm", enabled = true, blocking = true, severityThreshold = "Medium", source = "Completion" },
        { name = "Protected Material Text", enabled = true, blocking = true, source = "Completion" },
        { name = "Protected Material Code", enabled = true, blocking = false, source = "Completion" },
      ]
    }
  }
}

resource "azurerm_cognitive_deployment" "chat" {
  name                   = var.model_name
  cognitive_account_id   = azurerm_cognitive_account.this.id
  rai_policy_name        = azapi_resource.content_filter.name
  version_upgrade_option = "NoAutoUpgrade" # pin the model version

  model {
    format  = "OpenAI"
    name    = var.model_name
    version = var.model_version
  }

  sku {
    name     = var.deployment_sku
    capacity = var.capacity_k_tpm
  }
}

# Least privilege: "OpenAI User" can call inference APIs only - it cannot
# list keys, change deployments or read other data-plane resources.
resource "azurerm_role_assignment" "openai_user" {
  for_each             = var.openai_user_principal_ids
  scope                = azurerm_cognitive_account.this.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = each.value
}

resource "azurerm_monitor_diagnostic_setting" "this" {
  name                       = "diag-to-law"
  target_resource_id         = azurerm_cognitive_account.this.id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_log {
    category = "Audit"
  }
  enabled_log {
    category = "RequestResponse"
  }
  enabled_metric {
    category = "AllMetrics"
  }
}
