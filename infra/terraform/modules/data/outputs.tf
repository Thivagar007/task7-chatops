output "storage_account_name" {
  value = azurerm_storage_account.this.name
}

output "table_endpoint" {
  value = azurerm_storage_account.this.primary_table_endpoint
}

output "tables" {
  value = [for t in azapi_resource.table : t.name]
}
