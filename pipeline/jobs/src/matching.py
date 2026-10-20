"""Step 2 - deterministic matching (brick 1, no AI).

For every source, the latest scraped row of each RID is matched to its PIM hotel (Open or Pre-opening), then:
  level 1  identity check: name, city, brand, country
  level 2  page check: the scraped page is the hotel's own (Booking URL, Expedia description)
  pre-verdict = the least favourable of the two, with its reason

Writes the current snapshot (replaced at each run):
  matching.match_candidates   one row per RID x source, with the indicators read by the judge agent
  matching.unknown_rids       RIDs of the scrapings not found in the PIM
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
    keys = ("pim_name", "pim_commercial_name", "pim_brand", "pim_former_brand", "pim_city", "pim_country",
            "scraped_name", "scraped_city", "scraped_brand", "scraped_country", "url", "page_name", "description_head",
            "shared_with")
    return hashlib.sha256(json.dumps([row.get(k) for k in keys], ensure_ascii=False).encode()).hexdigest()


def match_source(source: str, cfg: dict, scraped: list[dict], hotels: dict, all_rids: set, context: dict) -> tuple[list, list]:
    candidates, unknown, seen = [], [], set()
    for s in scraped:
        rid = mr.normalize_rid(s["rid"])
        if not rid or rid in seen:
            continue
        seen.add(rid)
        if rid not in all_rids:
            unknown.append({**context, "rid": rid, "source": source, "depot_id": s.get("depot_id"), "scraped_name": s.get("name")})
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
        candidates.append({
            **context, "rid": rid, "source": source, "depot_id": s.get("depot_id"), "load_dts": s.get("load_dts"),
            "pim_entity_id": hotel["entity_id"], "pim_name": hotel["name"], "pim_commercial_name": hotel["commercial_name"],
            "pim_brand": hotel["brand"], "pim_former_brand": hotel["old_brand"], "pim_rebranding_date": hotel["rebranding_date"],
            "pim_city": hotel["city"], "pim_country": hotel["country"], "pim_address": hotel["address"], "pim_status": hotel["status"],
            "scraped_name": s.get("name"), "scraped_city": s.get("city"), "scraped_brand": s.get("brand"),
            "scraped_country": s.get("country"), "url": s.get("url"), "page_name": found, "page_country": page_cc,
            "description_head": (s.get("about") or "")[:ABOUT_HEAD] or None,
            "name_score": identity["name_score"], "gaps": identity["gaps"], "rebranding": identity["rebranding"],
            "shared_with": None, "identity_verdict": identity["verdict"], "identity_reason": identity["reason"],
            "page_key": page_key, "page_verdict": page["verdict"] if page else None,
            "page_reason": page["reason"] if page else None, "page_rank": page["rank"] if page else 0,
        })
    mr.resolve_shared_pages(candidates)
    for c in candidates:
        c.pop("page_key"), c.pop("page_rank")
        c["pre_verdict"], c["pre_reason"] = mr.combine(c["identity_verdict"], c["identity_reason"], c["page_verdict"], c["page_reason"])
        c["source_hash"] = source_hash(c)
    return candidates, unknown


def run(settings: Settings) -> int:
    client = bigquery.Client(project=settings.project_id)
    labels, model = cvl_labels(client, settings), field_model(client, settings)
    hotels = hotels_in_scope(client, settings, labels, model)
    all_rids = {mr.normalize_rid(r["rid"]) for r in bq.rows(client, f"SELECT ProductRid AS rid FROM `{settings.table('raw', 'pim_product')}`")}
    context = {"run_id": settings.run_id, "computed_at": datetime.now(timezone.utc)}
    logger.info("%d PIM hotels in scope %s", len(hotels), settings.scope_status)

    candidates, unknown = [], []
    for source, cfg in SOURCES.items():
        c, u = match_source(source, cfg, latest_rows(client, settings, source, cfg), hotels, all_rids, context)
        stats = {v: sum(x["pre_verdict"] == v for x in c) for v in (mr.OK, mr.TO_CHECK, mr.REJECTED)}
        logger.info("%s: %d matched %s, %d RIDs not in the PIM", source, len(c), stats, len(u))
        candidates += c
        unknown += u

    bq.load(client, settings.table("matching", "match_candidates"), candidates, bq.schema("match_candidates"), truncate=True)
    bq.load(client, settings.table("matching", "unknown_rids"), unknown, bq.schema("unknown_rids"), truncate=True)
    return 0


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
