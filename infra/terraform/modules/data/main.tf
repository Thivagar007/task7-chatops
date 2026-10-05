# =====================================================================
# Table Storage for the bot
#   conversations : last 5 messages per Teams conversation (multi-turn memory)
#   ratelimit     : request counter per user per hour (20/hour limit)
#   pending       : rollback waiting for "YES" confirmation
#
# Shared keys are DISABLED - the bot uses its managed identity (RBAC only).
# =====================================================================

resource "azurerm_storage_account" "this" {
  name                            = var.storage_account_name
  location                        = var.location
  resource_group_name             = var.resource_group_name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  shared_access_key_enabled       = false # no keys / SAS - Entra ID only
  allow_nested_items_to_be_public = false
  tags                            = var.tags
}

# Tables are created through the management plane (ARM), so Terraform does
# not need data-plane keys or data roles to create them.
resource "azapi_resource" "table" {
  for_each  = toset(var.table_names)
  type      = "Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01"
  name      = each.value
  parent_id = "${azurerm_storage_account.this.id}/tableServices/default"
  body      = { properties = {} }
}

# Least privilege: the bot can read/write rows in its three tables only -
# not other tables, not blobs/queues, and it cannot manage the account.
resource "azurerm_role_assignment" "bot_table" {
  for_each             = azapi_resource.table
  scope                = each.value.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = var.bot_principal_id
}

resource "azurerm_role_assignment" "deployer_reader" {
  scope                = azurerm_storage_account.this.id
  role_definition_name = "Storage Table Data Reader"
  principal_id         = var.reader_principal_id
}
