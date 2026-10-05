output "name_suffix" {
  value = local.suffix
}

output "resource_groups" {
  value = {
    bot    = azurerm_resource_group.bot.name
    target = azurerm_resource_group.target.name
  }
}

output "app_insights_name" {
  value = module.monitoring.app_insights_name
}

output "log_analytics_workspace_id" {
  value = module.monitoring.log_analytics_workspace_id
}

output "bot_identity" {
  value = {
    name         = module.bot_identity.name
    client_id    = module.bot_identity.client_id
    principal_id = module.bot_identity.principal_id
  }
}
