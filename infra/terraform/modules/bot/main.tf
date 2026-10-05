# =====================================================================
# Azure Bot (Bot Service) + Microsoft Teams channel
#
#   microsoft_app_type = UserAssignedMSI -> the bot's identity IS the
#   user-assigned managed identity. There is no app registration secret
#   anywhere; the Function App proves itself to the Bot Connector with
#   a managed-identity token.
# =====================================================================

resource "azurerm_bot_service_azure_bot" "this" {
  name                    = var.name
  resource_group_name     = var.resource_group_name
  location                = "global"
  sku                     = "F0" # free tier
  microsoft_app_type      = "UserAssignedMSI"
  microsoft_app_id        = var.identity_client_id
  microsoft_app_msi_id    = var.identity_id
  microsoft_app_tenant_id = var.tenant_id
  endpoint                = var.messaging_endpoint
  tags                    = var.tags
}

resource "azurerm_bot_channel_ms_teams" "this" {
  bot_name            = azurerm_bot_service_azure_bot.this.name
  location            = azurerm_bot_service_azure_bot.this.location
  resource_group_name = var.resource_group_name
}
