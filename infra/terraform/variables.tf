variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "project" {
  description = "Short project name used in resource names"
  type        = string
  default     = "chatops"
}

variable "location" {
  description = "Region for the bot stack (Function App, storage, monitoring)"
  type        = string
  default     = "centralindia"
}

variable "openai_location" {
  description = "Region for Azure OpenAI - must have gpt-4o-mini quota for the chosen SKU"
  type        = string
  default     = "eastus"
}

variable "tags" {
  description = "Tags required by the subscription policy (applied to every resource)"
  type        = map(string)
  default = {
    environment   = "dev"
    owner         = "thivagarraja"
    "cost-center" = "training"
  }
}
