# One user-assigned identity is used for:
#   - the Azure Bot registration (msa app type UserAssignedMSI -> no app password)
#   - the Function App: Azure OpenAI, Table Storage, Azure Monitor, App Service, Azure DevOps
resource "azurerm_user_assigned_identity" "this" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
}
