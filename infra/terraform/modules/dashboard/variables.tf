variable "name" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }
variable "app_insights_id" { type = string }
variable "app_insights_name" { type = string }
variable "title" {
  type    = string
  default = "Task 7 - ChatOps Bot"
}
