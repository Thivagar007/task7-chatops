variable "name" {
  description = "Azure OpenAI account name (also used as the custom subdomain)"
  type        = string
}
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "model_name" {
  type    = string
  default = "gpt-4o"
}
variable "model_version" {
  type    = string
  default = "2024-11-20"
}
variable "deployment_sku" {
  description = "Standard (regional) - the SKU with quota in this subscription"
  type        = string
  default     = "Standard"
}
variable "capacity_k_tpm" {
  description = "Deployment capacity in thousands of tokens per minute"
  type        = number
  default     = 10
}

variable "openai_user_principal_ids" {
  description = "Principals that get 'Cognitive Services OpenAI User' (bot identity, deployer)"
  type        = map(string)
}

variable "log_analytics_workspace_id" { type = string }
