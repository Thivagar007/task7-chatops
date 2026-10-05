# =====================================================================
# Bot backend: Azure Functions (Node.js 22, Windows Consumption)
#
#   - Windows Consumption is the serverless plan that supports a STAGING
#     deployment slot (Part D: deploy to staging -> smoke test -> swap).
#   - Runs as the user-assigned bot identity: Azure OpenAI, Table Storage,
#     Azure Monitor, App Service and Azure DevOps are all called with
#     Entra ID tokens. The only key is the platform's own host storage.
# =====================================================================

# Host storage for the Functions runtime (Consumption needs an Azure Files
# content share, which requires an account key - platform only, no app data)
resource "azurerm_storage_account" "host" {
  name                            = "stfn${var.name_prefix}${var.name_suffix}"
  location                        = var.location
  resource_group_name             = var.resource_group_name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = var.tags
}

resource "azurerm_service_plan" "this" {
  name                = "asp-${var.name_prefix}-${var.name_suffix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  os_type             = "Windows"
  sku_name            = "Y1" # Consumption
  tags                = var.tags
}

locals {
  common_settings = merge(var.app_settings, {
    AZURE_CLIENT_ID          = var.identity_client_id # DefaultAzureCredential picks this identity
    MicrosoftAppType         = "UserAssignedMSI"      # Bot Framework auth with the identity (no app password)
    MicrosoftAppId           = var.identity_client_id
    MicrosoftAppTenantId     = var.tenant_id
    WEBSITE_RUN_FROM_PACKAGE = "1"
  })
}

resource "azurerm_windows_function_app" "this" {
  name                        = "func-${var.name_prefix}-${var.name_suffix}"
  location                    = var.location
  resource_group_name         = var.resource_group_name
  service_plan_id             = azurerm_service_plan.this.id
  storage_account_name        = azurerm_storage_account.host.name
  storage_account_access_key  = azurerm_storage_account.host.primary_access_key
  functions_extension_version = "~4"
  https_only                  = true
  tags                        = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  site_config {
    minimum_tls_version                    = "1.2"
    ftps_state                             = "Disabled"
    application_insights_connection_string = var.app_insights_connection_string
    application_stack {
      node_version = "~22"
    }
  }

  app_settings = merge(local.common_settings, { APP_SLOT = "production" })

  sticky_settings {
    app_setting_names = ["APP_SLOT"]
  }

  lifecycle {
    ignore_changes = [tags["hidden-link: /app-insights-resource-id"]]
  }
}

resource "azurerm_windows_function_app_slot" "staging" {
  name                       = "staging"
  function_app_id            = azurerm_windows_function_app.this.id
  storage_account_name       = azurerm_storage_account.host.name
  storage_account_access_key = azurerm_storage_account.host.primary_access_key
  https_only                 = true
  tags                       = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  site_config {
    minimum_tls_version                    = "1.2"
    ftps_state                             = "Disabled"
    application_insights_connection_string = var.app_insights_connection_string
    application_stack {
      node_version = "~22"
    }
  }

  app_settings = merge(local.common_settings, { APP_SLOT = "staging" })

  lifecycle {
    ignore_changes = [tags["hidden-link: /app-insights-resource-id"]]
  }
}
