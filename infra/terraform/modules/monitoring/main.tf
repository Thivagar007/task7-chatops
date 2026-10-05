resource "azurerm_log_analytics_workspace" "this" {
  name                = "law-${var.name_prefix}-${var.name_suffix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = var.retention_in_days
  daily_quota_gb      = 1 # lab cost guard
  tags                = var.tags
}

# Workspace-based Application Insights for the Function App (bot telemetry,
# custom events: BotRequest, ToolCall, OpenAITokens, ContentFiltered, RateLimited)
resource "azurerm_application_insights" "this" {
  name                = "appi-${var.name_prefix}-${var.name_suffix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.this.id
  application_type    = "Node.JS"
  tags                = var.tags
}
