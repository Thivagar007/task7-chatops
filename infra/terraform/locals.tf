# Short random suffix keeps globally-unique names (storage, function app, openai) unique
resource "random_string" "suffix" {
  length  = 4
  upper   = false
  special = false
  numeric = false
}

locals {
  suffix = random_string.suffix.result

  tags = merge(var.tags, {
    project      = "task7"
    "managed-by" = "terraform"
  })
}
