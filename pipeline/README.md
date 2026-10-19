# Pipeline d'enrichissement

Transforme chaque dépôt de scraping (Booking, Expedia) en valeurs proposées pour le PIM Accor, en passant par deux
agents IA (Gemini) et une validation humaine dans l'interface. L'infrastructure est dans `terraform/core/pipeline.tf`,
le déploiement dans `cloudbuild.yaml`, comme le front et le back.

Référence : *Dossier de conception – Pipeline d'enrichissement PIM Hôtels V1* et audit qualité (livrables 1 et 1.1).

## Le flux

```
dépôt   gs://bkt-<base>-ota-files/<source>/<fichier>.csv     (CSV « ; », UTF-8 ; dossiers : booking_equipements, booking_piscines, expedia)
   │  Eventarc
   ▼
gcr-<base>-load-bq      chargement dans raw.<source> (chaque dépôt conservé : depot_id, load_dts), puis démarrage du workflow
   │
wf-<base>-enrichment
   1. gcrj-…-extract-pim   PIM par API, lecture seule, sans contacts (sauté si extrait il y a moins de 12 h)   → raw.pim_*
   2. gcrj-…-matching      brique 1, sans IA : RID, identité, page OTA, pré-verdict                          → matching.candidats
   3. gcrj-…-judge         brique 2, agent juge : score 0-100 et statut                                       → matching.jugements
   4. gcrj-…-enrich        brique 3, agent d'enrichissement, une exécution par famille                        → enhanced.enrichissements
                           (uniquement les rapprochements validés)
   │
backend + front         validation humaine des rapprochements puis des enrichissements                       → validation.decisions_*
   │                    (contrat : docs/contrat-back.md)
gcrj-…-export           fichier plat du PIM enrichi, quand plus rien n'est en attente                         → bkt-<base>-exports/export/<date>/
```

`<base>` = `cvto-accor-pim-enrichment-<env>-euw1` (datasets : `cvto_accor_pim_enrichment_<env>_euw1_<dataset>`).
Un planificateur relance le workflow toutes les 15 minutes, sans extraction du PIM, pour enrichir les hôtels dont le
rapprochement vient d'être validé dans l'interface.

## Règles de passage

| Rapprochement (RID × source) | Origine | Passe à l'enrichissement |
| --- | --- | --- |
| `valide_auto` | agent juge : score ≥ seuil haut (80), verdict `meme_hotel`, pas d'indicateur bloquant | oui |
| `a_valider` | agent juge : entre les deux seuils | non, attend une décision dans l'interface |
| `rejete_auto` | agent juge : score < seuil bas (30), ou page dans un autre pays | non |
| `valide_humain` / `rejete_humain` | décision dans l'interface ; l'emporte toujours sur l'agent | oui / non |

Un hôtel est enrichi avec ses seules sources validées. Les enrichissements sont `proposee` par l'agent, puis `validee`,
`invalidee` ou `corrigee` dans l'interface ; la validation automatique (`pipeline.enrich_auto_validate_score`) est
désactivée par défaut. L'agent n'écrase jamais une valeur du PIM : un désaccord devient un `ecart`.

## Organisation

| Dossier | Contenu |
| --- | --- |
| `jobs/` | Image unique des cinq étapes (`src/extract_pim.py`, `matching.py`, `judge.py`, `enrich.py`, `export.py`), schémas BigQuery (`src/schemas`), vues (`src/views`), tests |
| `load-bq/` | Service Cloud Run de chargement des dépôts (Flask, appelé par Eventarc), tests |
| `workflow/` | Workflow d'orchestration |
| `prompts/` | Prompts versionnés : `judge/`, `enrichment/00-bloc-commun.md`, une famille par dossier (`prompt.md`, `targets.json`) |
| `tools/` | `build_targets.py` (cibles depuis le fichier 1.1), `check_prompts.py`, `replay_matching_audit.py` (non-régression) |
| `docs/contrat-back.md` | Ce que le backend lit et écrit (vues, tables de décisions, export) |

Les 54 champs enrichis sont répartis en 6 familles : accueil et services, accessibilité et sécurité, restauration,
piscine, parking, bien-être et sport. Une nouvelle source de scraping = un dossier de dépôt et une entrée dans
`jobs/src/sources.py`.

## Réglages

Dans `terraform/core/terraform.tfvars`, attribut `pipeline` de l'environnement (`environments.dev.pipeline`, valeurs par
défaut dans `terraform/core/variables.tf`) :
modèle Gemini, seuils de l'agent juge, validation automatique des enrichissements, périmètre (`scope_status`),
planificateur en pause ou non. Ils sont posés en variables d'environnement des jobs par Terraform ; la CI ne change que
les images.

## Développement local

```bash
cd pipeline
pip install -r jobs/src/requirements.txt -r load-bq/src/requirements.txt pytest
python -m pytest -q jobs/tests load-bq/tests
python tools/check_prompts.py prompts

# Non-régression de la brique 1 sur les fichiers de l'audit (doit retrouver 4 904 OK, 774 à valider, 34 rejetés :
# les chiffres de l'audit moins ses 9 validations manuelles, laissées à l'agent juge)
python tools/replay_matching_audit.py "<…>/accor_enrichment_factory/Documents de travail"

# Régénérer les cibles de l'agent après un changement de priorités
pip install -r tools/requirements.txt
python tools/build_targets.py "<…>/1.1 Rapprochement et enrichissements possibles - Audit Qualité PIM Hôtels.xlsx" <…>/live_model.json --version enrich-v2
python tools/check_prompts.py prompts
```

## Mise en service (par environnement)

1. `cd terraform/core && terraform workspace select dev && terraform plan -out=tfplan && terraform apply tfplan` : crée datasets, tables, vues, Firestore, secret,
   jobs, service de chargement, Eventarc, workflow (coquille) et planificateur (en pause).
2. Ajouter la clé API du PIM (compte Reader, lecture seule) dans le secret créé vide :
   ```bash
   printf '%s' "$PIM_API_KEY" | gcloud secrets versions add secret-cvto-accor-pim-enrichment-dev-euw1-pim-api-key \
     --project=cvto-accor-pim-enrichment-dev --data-file=-
   ```
3. Pousser sur `dev` : Cloud Build teste, construit les images, met à jour les jobs et le service, déploie le workflow et
   synchronise les prompts.

## Exploitation

- **Déposer un scraping** : `gcloud storage cp resultats_equipements.csv gs://bkt-cvto-accor-pim-enrichment-dev-euw1-ota-files/booking_equipements/`
- **Lancer le workflow à la main** :
  `gcloud workflows run wf-cvto-accor-pim-enrichment-dev-euw1-enrichment --location=europe-west1 --data='{"priorites": "P1"}'`
- **Forcer une nouvelle extraction du PIM** : exécuter le job `extract-pim` avec `FORCE=true`.
- **Calibrer l'agent juge** : ajuster `judge_threshold_high` et `judge_threshold_low` après une revue des 774 cas à
  valider et des 34 rejets, puis `terraform apply`.
- **Planificateur** : le reprendre (`environments.dev.pipeline = { scheduler_paused = false }`) quand la chaîne a tourné de bout en bout.

## Points ouverts

- **Format d'import inriver** : l'export produit un fichier par type d'entité avec les codes PIM ; son format est
  provisoire et sera aligné sur la spécification d'import fournie par Accor.
- **Seuils de l'agent juge** : 80 et 30 par défaut, à calibrer.
- **Modèle Gemini** : `gemini-3.8-flash` par défaut ; à confirmer par un banc d'essai.
- **Écran de validation des rapprochements** : à prévoir côté front et back (voir `docs/contrat-back.md`).
