variable "storage_account_name" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "table_names" {
  description = "Tables used by the bot"
  type        = list(string)
  default     = ["conversations", "ratelimit", "pending"]
}

variable "bot_principal_id" {
  description = "Bot identity - gets Storage Table Data Contributor on each table only"
  type        = string
}

variable "reader_principal_id" {
  description = "Deployer - read-only access to inspect rows for evidence"
  type        = string
}
