# Usage : make <cible> ENV=dev|stg
ENV      ?= dev
TF       ?= terraform
CORE     := core
BACKEND  := ../config/terraform_$(ENV)_backend.hcl
VARFILES := -var-file=../vars/global.tfvars -var-file=../vars/$(ENV).tfvars
PLAN     := tfplan_$(ENV)

.PHONY: help check-env init plan apply destroy output fmt validate

help:
	@echo "make init|plan|apply|output|destroy ENV=dev|stg"
	@echo "make fmt | validate"
	@echo "Déploiement applicatif : via Cloud Build (push sur les branches dev / stg), voir docs/ci-cd-cloud-build.html"

check-env:
	@test -f config/terraform_$(ENV)_backend.hcl || (echo "ENV inconnu : $(ENV)" && exit 1)

init: check-env
	$(TF) -chdir=$(CORE) init -reconfigure -backend-config=$(BACKEND)

plan: check-env
	$(TF) -chdir=$(CORE) plan $(VARFILES) -out=$(PLAN)

apply: check-env
	$(TF) -chdir=$(CORE) apply $(PLAN)

output: check-env
	$(TF) -chdir=$(CORE) output

destroy: check-env
	$(TF) -chdir=$(CORE) destroy $(VARFILES)

fmt:
	$(TF) fmt -recursive

validate:
	$(TF) -chdir=$(CORE) validate
