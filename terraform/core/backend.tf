# Un seul backend pour tous les environnements : un state par workspace dans le bucket,
#   gs://bkt-cvto-accor-pim-enrichment-dev-euw1-tfstate/core/<workspace>.tfstate  (core/dev.tfstate, core/stg.tfstate)
# Les variables sont interdites ici : valeurs écrites en dur.
terraform {
  backend "gcs" {
    bucket                      = "bkt-cvto-accor-pim-enrichment-dev-euw1-tfstate"
    prefix                      = "core"
    impersonate_service_account = "sa-dev-terraform@cvto-accor-pim-enrichment-dev.iam.gserviceaccount.com"
  }
}
