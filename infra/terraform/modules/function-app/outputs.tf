output "name" {
  value = azurerm_windows_function_app.this.name
}

output "id" {
  value = azurerm_windows_function_app.this.id
}

output "hostname" {
  value = azurerm_windows_function_app.this.default_hostname
}

output "staging_hostname" {
  value = azurerm_windows_function_app_slot.staging.default_hostname
}
