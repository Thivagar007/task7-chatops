terraform {
  required_version = ">= 1.6"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Reuses the Task 6 state storage account (separate state key).
  # use_azuread_auth = your az login identity, no storage keys.
  backend "azurerm" {
    resource_group_name  = "rg-task6-tfstate"
    storage_account_name = "sttask6tf78731"
    container_name       = "tfstate"
    key                  = "task7-chatops.tfstate"
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  features {
    cognitive_account {
      purge_soft_delete_on_destroy = true # lets the OpenAI account be recreated with the same name
    }
    key_vault {
      purge_soft_delete_on_destroy = true
    }
  }
  subscription_id     = var.subscription_id
  storage_use_azuread = true
}

provider "azapi" {
  subscription_id = var.subscription_id
}
