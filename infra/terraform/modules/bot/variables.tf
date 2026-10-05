variable "name" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "identity_id" { type = string }
variable "identity_client_id" { type = string }
variable "tenant_id" { type = string }

variable "messaging_endpoint" {
  description = "https://<function-app>/api/messages"
  type        = string
}
