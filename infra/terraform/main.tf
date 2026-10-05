# =====================================================================
# Task 7 - Azure OpenAI ChatOps bot (root module)
#
#   modules/monitoring  -> Log Analytics + Application Insights
#   modules/identity    -> user-assigned identity for the bot + Function App
#   (later steps add: openai, data, function-app, bot, target-app, dashboard)
# =====================================================================

data "azurerm_client_config" "current" {}

# ---------- Resource groups ----------

# The bot stack: OpenAI, Function App, Bot, storage, monitoring
resource "azurerm_resource_group" "bot" {
  name     = "rg-task7-${var.project}"
  location = var.location
  tags     = local.tags
}

# A small demo service the bot can query and roll back (real data for the tools)
resource "azurerm_resource_group" "target" {
  name     = "rg-task7-target"
  location = var.location
  tags     = local.tags
}

# ---------- Monitoring ----------
module "monitoring" {
  source = "./modules/monitoring"

  name_prefix         = var.project
  name_suffix         = local.suffix
  location            = azurerm_resource_group.bot.location
  resource_group_name = azurerm_resource_group.bot.name
  tags                = local.tags
}

# ---------- Identity used by the Function App AND the Azure Bot (no secrets) ----------
module "bot_identity" {
  source = "./modules/identity"

  name                = "id-${var.project}-bot"
  location            = azurerm_resource_group.bot.location
  resource_group_name = azurerm_resource_group.bot.name
  tags                = local.tags
}

# ---------- Azure OpenAI (East US - gpt-4o 2024-11-20, Standard quota 50K TPM) ----------
module "openai" {
  source = "./modules/openai"

  name                       = "oai-${var.project}-${local.suffix}"
  location                   = var.openai_location
  resource_group_name        = azurerm_resource_group.bot.name
  tags                       = local.tags
  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id

  openai_user_principal_ids = {
    bot      = module.bot_identity.principal_id
    deployer = data.azurerm_client_config.current.object_id # lets you test with your own az login token
  }
}

# ---------- Table Storage: conversation memory, rate limit, pending confirmations ----------
module "data" {
  source = "./modules/data"

  storage_account_name = "st${var.project}${local.suffix}"
  location             = azurerm_resource_group.bot.location
  resource_group_name  = azurerm_resource_group.bot.name
  tags                 = local.tags

  bot_principal_id    = module.bot_identity.principal_id
  reader_principal_id = data.azurerm_client_config.current.object_id
}

# ---------- Target service the bot reports on and rolls back ----------
module "target_app" {
  source = "./modules/target-app"

  name_prefix         = var.project
  name_suffix         = local.suffix
  location            = azurerm_resource_group.target.location
  resource_group_name = azurerm_resource_group.target.name
  tags                = local.tags
}

# ---------- Bot backend: Function App (+ staging slot) ----------
module "function_app" {
  source = "./modules/function-app"

  name_prefix         = var.project
  name_suffix         = local.suffix
  location            = azurerm_resource_group.bot.location
  resource_group_name = azurerm_resource_group.bot.name
  tags                = local.tags

  identity_id                    = module.bot_identity.id
  identity_client_id             = module.bot_identity.client_id
  tenant_id                      = module.bot_identity.tenant_id
  app_insights_connection_string = module.monitoring.app_insights_connection_string

  # Endpoints and names only - every call is authorised with the managed identity
  app_settings = {
    OPENAI_ENDPOINT        = module.openai.endpoint
    OPENAI_DEPLOYMENT      = module.openai.deployment_name
    OPENAI_API_VERSION     = "2024-10-21"
    TABLE_ENDPOINT         = module.data.table_endpoint
    ADO_ORG_URL            = var.ado_org_url
    ADO_PROJECT            = var.ado_project
    AZ_SUBSCRIPTION_ID     = var.subscription_id
    ALERT_RESOURCE_GROUPS  = "${azurerm_resource_group.target.name},${azurerm_resource_group.bot.name}"
    TARGET_RESOURCE_GROUP  = azurerm_resource_group.target.name
    ALLOWED_APPS           = module.target_app.name # rollback allow-list
    RATE_LIMIT_PER_HOUR    = tostring(var.rate_limit_per_hour)
    HISTORY_MAX_MESSAGES   = "5"
  }
}

# ---------- Azure Bot + Teams channel ----------
module "bot" {
  source = "./modules/bot"

  name                = "bot-${var.project}-${local.suffix}"
  resource_group_name = azurerm_resource_group.bot.name
  tags                = local.tags

  identity_id        = module.bot_identity.id
  identity_client_id = module.bot_identity.client_id
  tenant_id          = module.bot_identity.tenant_id
  messaging_endpoint = "https://${module.function_app.hostname}/api/messages"
}

# ---------- Least-privilege access for the bot's tools ----------

# get_active_alerts: read alerts in the two resource groups only
resource "azurerm_role_assignment" "bot_monitoring_reader" {
  for_each = {
    target = azurerm_resource_group.target.id
    bot    = azurerm_resource_group.bot.id
  }
  scope                = each.value
  role_definition_name = "Monitoring Reader"
  principal_id         = module.bot_identity.principal_id
}

# get_deployment_history + trigger_rollback: only on the target app
resource "azurerm_role_assignment" "bot_website_contributor" {
  scope                = module.target_app.id
  role_definition_name = "Website Contributor"
  principal_id         = module.bot_identity.principal_id
}
