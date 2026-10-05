output "id" {
  value = azurerm_portal_dashboard.this.id
}

output "name" {
  value = azurerm_portal_dashboard.this.name
}

output "portal_url" {
  value = "https://portal.azure.com/#@/dashboard/arm${azurerm_portal_dashboard.this.id}"
}
