variable "name_prefix" { type = string }
variable "name_suffix" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "identity_id" {
  description = "User-assigned identity resource ID (bot identity)"
  type        = string
}
variable "identity_client_id" { type = string }
variable "tenant_id" { type = string }

variable "app_insights_connection_string" {
  type      = string
  sensitive = true
}

variable "app_settings" {
  description = "Bot configuration (endpoints and names only - no secrets)"
  type        = map(string)
}
