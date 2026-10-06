variable "project_id" {
  type = string
}

variable "service_accounts" {
  description = "Service accounts à créer, indexés par une clé logique."
  type = map(object({
    account_id   = string
    display_name = string
    description  = optional(string)
  }))
  default = {}
}

variable "project_roles" {
  description = "Bindings IAM additifs au niveau projet."
  type = list(object({
    role   = string
    member = string
  }))
  default = []
}

variable "service_account_iam_members" {
  description = "Bindings IAM sur les SA créés par ce module (sa_key = clé de var.service_accounts)."
  type = list(object({
    sa_key = string
    role   = string
    member = string
  }))
  default = []
}
