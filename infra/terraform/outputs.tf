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

output "openai" {
  value = {
    name           = module.openai.name
    endpoint       = module.openai.endpoint
    deployment     = module.openai.deployment_name
    content_filter = module.openai.content_filter_policy
  }
}

output "table_storage" {
  value = {
    account  = module.data.storage_account_name
    endpoint = module.data.table_endpoint
    tables   = module.data.tables
  }
}

output "function_app" {
  value = {
    name             = module.function_app.name
    url              = "https://${module.function_app.hostname}"
    staging_url      = "https://${module.function_app.staging_hostname}"
    bot_endpoint     = "https://${module.function_app.hostname}/api/messages"
  }
}

output "bot_name" {
  value = module.bot.name
}

output "target_app" {
  value = {
    name        = module.target_app.name
    url         = "https://${module.target_app.hostname}"
    staging_url = "https://${module.target_app.staging_hostname}"
  }
}
