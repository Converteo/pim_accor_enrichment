"""Step 2 - deterministic matching (brick 1, no AI).

For every source, the latest scraped row of each RID is matched to its PIM hotel (Open or Pre-opening), then:
  level 1  identity check: name, city, brand, country
  level 2  page check: the scraped page is the hotel's own (Booking URL, Expedia description)
  pre-verdict = the least favourable of the two, with its reason

Writes the current snapshot (replaced at each run):
  matching.candidats     one row per RID x source, with the indicators read by the judge agent
  matching.rid_absents   RIDs of the scrapings not found in the PIM
"""

import hashlib
import json
import logging
import sys
from datetime import datetime, timezone

from google.cloud import bigquery

import bq
import matching_rules as mr
from config import Settings
from pim import cvl_labels, field_model, hotels_in_scope
from sources import SOURCES

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ABOUT_HEAD = 300  # characters of the Expedia description given to the judge


def latest_rows(client: bigquery.Client, settings: Settings, source: str, cfg: dict) -> list[dict]:
    """Latest row of each RID in the source's raw table."""
    wanted = {k: cfg.get(k) for k in ("rid", "name", "city", "brand", "country", "url", "about")}
    cols = ", ".join(f"CAST(`{c}` AS STRING) AS {k}" if c else f"CAST(NULL AS STRING) AS {k}" for k, c in wanted.items())
    sql = f"""
        SELECT {cols}, depot_id, load_dts
        FROM `{settings.table('raw', source)}`
        WHERE `{cfg['rid']}` IS NOT NULL
        QUALIFY ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(CAST(`{cfg['rid']}` AS STRING))) ORDER BY load_dts DESC) = 1
    """
    try:
        return bq.rows(client, sql)
    except Exception as e:  # the source has never been deposited
        logger.warning("Source %s not readable (%s), skipped", source, e)
        return []


def source_hash(row: dict) -> str:
    keys = ("nom_pim", "nom_commercial_pim", "marque_pim", "ancienne_marque_pim", "ville_pim", "pays_pim",
            "nom_scraping", "ville_scraping", "marque_scraping", "pays_scraping", "url", "page_scrapee", "debut_description",
            "partagee_avec")
    return hashlib.sha256(json.dumps([row.get(k) for k in keys], ensure_ascii=False).encode()).hexdigest()


def match_source(source: str, cfg: dict, scraped: list[dict], hotels: dict, all_rids: set, context: dict) -> tuple[list, list]:
    candidats, absents, seen = [], [], set()
    for s in scraped:
        rid = mr.normalize_rid(s["rid"])
        if not rid or rid in seen:
            continue
        seen.add(rid)
        if rid not in all_rids:
            absents.append({**context, "rid": rid, "source": source, "depot_id": s.get("depot_id"), "nom_scraping": s.get("name")})
            continue
        hotel = hotels.get(rid)
        if hotel is None:  # in the PIM, but not Open or Pre-opening
            continue
        identity = mr.identity_check(hotel, s)
        page_key = page_cc = found = None
        if cfg.get("page") == "booking_url":
            page_key, page_cc, found = mr.booking_page(s.get("url"))
        elif cfg.get("page") == "expedia_about":
            found = mr.expedia_page(s.get("about"))
        page = mr.page_check(hotel, found, page_cc) if cfg.get("page") else None
        candidats.append({
            **context, "rid": rid, "source": source, "depot_id": s.get("depot_id"), "load_dts": s.get("load_dts"),
            "pim_entity_id": hotel["entity_id"], "nom_pim": hotel["name"], "nom_commercial_pim": hotel["commercial_name"],
            "marque_pim": hotel["brand"], "ancienne_marque_pim": hotel["old_brand"], "date_rebranding_pim": hotel["rebranding_date"],
            "ville_pim": hotel["city"], "pays_pim": hotel["country"], "adresse_pim": hotel["address"], "statut_pim": hotel["status"],
            "nom_scraping": s.get("name"), "ville_scraping": s.get("city"), "marque_scraping": s.get("brand"),
            "pays_scraping": s.get("country"), "url": s.get("url"), "page_scrapee": found, "pays_page": page_cc,
            "debut_description": (s.get("about") or "")[:ABOUT_HEAD] or None,
            "score_nom": identity["score_nom"], "ecarts": identity["ecarts"], "rebranding": identity["rebranding"],
            "partagee_avec": None, "verdict_identite": identity["verdict"], "motif_identite": identity["motif"],
            "page_key": page_key, "page_verdict": page["verdict"] if page else None,
            "page_motif": page["motif"] if page else None, "page_rank": page["rank"] if page else 0,
        })
    mr.resolve_shared_pages(candidats)
    for c in candidats:
        c["verdict_page"], c["motif_page"] = c.pop("page_verdict"), c.pop("page_motif")
        c.pop("page_key"), c.pop("page_rank")
        c["pre_verdict"], c["pre_motif"] = mr.combine(c["verdict_identite"], c["motif_identite"], c["verdict_page"], c["motif_page"])
        c["source_hash"] = source_hash(c)
    return candidats, absents


def run(settings: Settings) -> int:
    client = bigquery.Client(project=settings.project_id)
    labels, model = cvl_labels(client, settings), field_model(client, settings)
    hotels = hotels_in_scope(client, settings, labels, model)
    all_rids = {mr.normalize_rid(r["rid"]) for r in bq.rows(client, f"SELECT ProductRid AS rid FROM `{settings.table('raw', 'pim_product')}`")}
    context = {"run_id": settings.run_id, "computed_at": datetime.now(timezone.utc)}
    logger.info("%d PIM hotels in scope %s", len(hotels), settings.scope_status)

    candidats, absents = [], []
    for source, cfg in SOURCES.items():
        c, a = match_source(source, cfg, latest_rows(client, settings, source, cfg), hotels, all_rids, context)
        stats = {v: sum(x["pre_verdict"] == v for x in c) for v in (mr.OK, mr.TO_CHECK, mr.REJECTED)}
        logger.info("%s: %d matched %s, %d RIDs not in the PIM", source, len(c), stats, len(a))
        candidats += c
        absents += a

    bq.load(client, settings.table("matching", "candidats"), candidats, bq.schema("candidats"), truncate=True)
    bq.load(client, settings.table("matching", "rid_absents"), absents, bq.schema("rid_absents"), truncate=True)
    return 0


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
