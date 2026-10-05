# =====================================================================
# Target service the bot operates on: "orders-svc" (a tiny Function App)
#   - production + staging slot   -> get_deployment_history / trigger_rollback
#   - metric alert on HTTP 5xx     -> get_active_alerts returns a real alert
# Windows Consumption keeps it free while idle.
# =====================================================================

resource "azurerm_storage_account" "host" {
  name                            = "stfnorders${var.name_suffix}"
  location                        = var.location
  resource_group_name             = var.resource_group_name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  tags                            = var.tags
}

resource "azurerm_service_plan" "this" {
  name                = "asp-orders-${var.name_suffix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  os_type             = "Windows"
  sku_name            = "Y1"
  tags                = var.tags
}

resource "azurerm_windows_function_app" "this" {
  name                        = "func-orders-svc-${var.name_suffix}"
  location                    = var.location
  resource_group_name         = var.resource_group_name
  service_plan_id             = azurerm_service_plan.this.id
  storage_account_name        = azurerm_storage_account.host.name
  storage_account_access_key  = azurerm_storage_account.host.primary_access_key
  functions_extension_version = "~4"
  https_only                  = true
  tags                        = var.tags

  site_config {
    minimum_tls_version = "1.2"
    ftps_state          = "Disabled"
    application_stack {
      node_version = "~22"
    }
  }

  app_settings = {
    WEBSITE_RUN_FROM_PACKAGE = "1"
    APP_SLOT                 = "production"
  }

  sticky_settings {
    app_setting_names = ["APP_SLOT"]
  }

  lifecycle {
    ignore_changes = [app_settings["APP_VERSION"], app_settings["FAIL_MODE"]]
  }
}

resource "azurerm_windows_function_app_slot" "staging" {
  name                       = "staging"
  function_app_id            = azurerm_windows_function_app.this.id
  storage_account_name       = azurerm_storage_account.host.name
  storage_account_access_key = azurerm_storage_account.host.primary_access_key
  https_only                 = true
  tags                       = var.tags

  site_config {
    minimum_tls_version = "1.2"
    ftps_state          = "Disabled"
    application_stack {
      node_version = "~22"
    }
  }

  app_settings = {
    WEBSITE_RUN_FROM_PACKAGE = "1"
    APP_SLOT                 = "staging"
  }

  lifecycle {
    ignore_changes = [app_settings["APP_VERSION"], app_settings["FAIL_MODE"]]
  }
}

# Real alert for get_active_alerts: any HTTP 5xx in 5 minutes
resource "azurerm_monitor_metric_alert" "http5xx" {
  name                = "alert-orders-svc-http5xx"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_windows_function_app.this.id]
  description         = "orders-svc returned HTTP 5xx responses"
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"
  auto_mitigate       = true
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "Http5xx"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 0
  }
}
