"""Step 5 (last lot) - flat file of the enriched PIM, ready to be loaded into the PIM by Accor.

PROVISIONAL FORMAT: to be aligned with the inriver import specification Accor will provide
(columns, identifiers, multi-values, creation of linked entities).

Runs only when nothing is waiting for a decision (no match a_valider, no value proposee), unless FORCE=true.
Writes to gs://<output bucket>/export/<yyyymmdd-hhmmss>/ :
  pim_product.csv         one row per hotel: PIM entity id, RID, then one column per enriched field (PIM codes)
  pim_<entite>.csv        one row per linked entity: entity id (or NOUVELLE-<RID>-<n> to create), hotel entity id, RID, fields
  tracabilite.csv         one row per value: source, excerpt, score, decision, author
CSV separated by « ; », UTF-8 with BOM, multi-values separated by « | ».
"""

import csv
import io
import logging
import sys
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery, storage

import bq
from config import Settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TRACE_COLUMNS = ["rid", "entite", "id_entite", "champ_pim", "libelle", "priorite", "valeur_pim", "valeur_finale", "libelle_valeur",
                 "methode", "source", "champ_source", "extrait_source", "score", "alerte", "statut_final", "auteur", "decided_at",
                 "commentaire", "llm_model", "prompt_version", "enriched_at"]


def pending(client: bigquery.Client, settings: Settings) -> dict:
    return bq.rows(client, f"""
        SELECT
          (SELECT COUNT(*) FROM `{settings.table('matching', 'v_rapprochements')}` WHERE statut_final IN ('a_valider', 'a_juger')) AS rapprochements,
          (SELECT COUNT(*) FROM `{settings.table('enhanced', 'v_enrichissements')}` e
           WHERE statut_final = 'proposee'
             AND EXISTS (SELECT 1 FROM `{settings.table('matching', 'v_rapprochements_valides')}` r WHERE r.rid = e.rid AND r.source = e.source)
          ) AS enrichissements
    """)[0]


def to_csv(header: list[str], data: list[dict]) -> str:
    out = io.StringIO()
    out.write("﻿")
    writer = csv.DictWriter(out, fieldnames=header, delimiter=";", extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for r in data:
        writer.writerow({k: ("" if r.get(k) is None else str(r.get(k)).replace("\n", " ").replace("\r", " ")) for k in header})
    return out.getvalue()


def flat_files(values: list[dict]) -> dict[str, str]:
    """File name -> CSV content."""
    files = {}
    products: dict[str, dict] = {}
    entities: dict[str, dict[str, dict]] = {}
    product_fields, entity_fields = set(), {}
    for v in values:
        if v["entite"] == "Product":
            row = products.setdefault(v["rid"], {"sys_id": v["pim_entity_id"], "ProductRid": v["rid"]})
            row[v["champ_pim"]] = v["valeur_finale"]
            product_fields.add(v["champ_pim"])
        else:
            key = v["id_entite"] if not str(v["id_entite"]).startswith("nouvelle") else f"NOUVELLE-{v['rid']}-{v['id_entite']}"
            row = entities.setdefault(v["entite"], {}).setdefault(key, {
                "sys_id": key, "parent_sys_id": v["pim_entity_id"], "ProductRid": v["rid"], "a_creer": key.startswith("NOUVELLE")})
            row[v["champ_pim"]] = v["valeur_finale"]
            entity_fields.setdefault(v["entite"], set()).add(v["champ_pim"])
    if products:
        files["pim_product.csv"] = to_csv(["sys_id", "ProductRid", *sorted(product_fields)], list(products.values()))
    for et, rows in entities.items():
        files[f"pim_{et.lower()}.csv"] = to_csv(["sys_id", "parent_sys_id", "ProductRid", "a_creer", *sorted(entity_fields[et])], list(rows.values()))
    files["tracabilite.csv"] = to_csv(TRACE_COLUMNS, values)
    return files


def run(settings: Settings) -> int:
    client = bigquery.Client(project=settings.project_id)
    waiting = pending(client, settings)
    if (waiting["rapprochements"] or waiting["enrichissements"]) and not settings.force:
        logger.info("Export not started, still waiting for decisions: %s", waiting)
        return 0
    values = bq.rows(client, f"SELECT * FROM `{settings.table('enhanced', 'v_enrichissements_valides')}` ORDER BY rid, entite, id_entite, champ_pim")
    if not values:
        logger.info("No validated value to export")
        return 0
    now = datetime.now(timezone.utc)
    prefix = f"export/{now:%Y%m%d-%H%M%S}"
    bucket = storage.Client(project=settings.project_id).bucket(settings.output_bucket)
    files = flat_files(values)
    for name, content in files.items():
        bucket.blob(f"{prefix}/{name}").upload_from_string(content.encode("utf-8"), content_type="text/csv")
    bq.load(client, settings.table("enhanced", "exports"), [{
        "export_id": uuid.uuid4().hex, "chemin": f"gs://{settings.output_bucket}/{prefix}/", "lignes": len(values),
        "hotels": len({v["rid"] for v in values}), "fichiers": ", ".join(sorted(files)), "lance_par": settings.run_id, "exported_at": now,
    }], bq.schema("exports"))
    logger.info("Exported %d values of %d hotels to gs://%s/%s/", len(values), len({v['rid'] for v in values}), settings.output_bucket, prefix)
    return 0


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
