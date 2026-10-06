variable "project_id" {
  type = string
}

variable "secret_id" {
  type = string
}

variable "replica_location" {
  description = "Région de stockage du secret (données conservées en UE)."
  type        = string
}

variable "accessors" {
  description = "Membres autorisés à lire la valeur (roles/secretmanager.secretAccessor)."
  type        = list(string)
  default     = []
}

variable "labels" {
  type    = map(string)
  default = {}
}
