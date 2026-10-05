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
