variable "project_id" {
  type = string
}

variable "services" {
  description = "APIs à activer (ex. run.googleapis.com)."
  type        = set(string)
}
