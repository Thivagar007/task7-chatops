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
