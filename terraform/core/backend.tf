# Backend partiel : bucket / préfixe / impersonation fournis par config/terraform_<env>_backend.hcl
#   terraform init -backend-config=../config/terraform_dev_backend.hcl   (ou : make init ENV=dev)
terraform {
  backend "gcs" {}
}
