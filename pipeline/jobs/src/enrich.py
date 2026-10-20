"""Step 4 - enrichment agent (brick 3), for one family of fields (FAMILY), launched by the workflow.

1. take the family's lease (Firestore)
2. hotels whose match is validated (auto_approved or human_approved) for at least one source of the family
3. per hotel: target fields (empty in the PIM, filtered by PRIORITIES), content of the validated sources only,
   fingerprint; a hotel already enriched with the same fingerprint is skipped
   the targets of all these hotels are written to enhanced.enrichment_targets when they changed (pending_enrichment
   in the views until a value is there)
4. batches of ENRICH_BATCH_SIZE hotels to Gemini, answers checked by the code (enrichment_core)
5. rows appended to enhanced.enrichments; a failed batch writes nothing and is taken again next run
"""

import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from google.cloud import bigquery, storage

import bq
import enrichment_core as core
from config import Settings
from decisions import AUTO_APPROVED, AUTO_REJECTED, NEEDS_REVIEW
from llm import GeminiAgent
from matching_rules import normalize_rid
from prompts import assemble, load_enrichment
from schemas_llm import EnrichResponse
from sources import SOURCES
from state import open_state
from throttle import AdaptiveLimit

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MAX_ALLOWED_VALUES = 300


def render_targets(fields: list[dict], allowed: dict[str, list[tuple[str, str]]]) -> str:
    """Targets block of the system prompt: one entry per field, with the allowed PIM values (code = label)."""
    lines = ["# Champs cibles de la famille", ""]
    for c in fields:
        lines.append(f"## {c['pim_field']} ({c['entity']}, {c['priority']})")
        lines.append(f"- Libellé : {c['label']}")
        kind = {"Boolean": "booléen : True ou False", "Integer": "nombre entier", "Double": "nombre",
                "CVL": "liste de valeurs PIM" + (" (plusieurs valeurs possibles, séparées par |)" if c.get("multivalue") else " (une seule valeur)"),
                "String": "texte", "LocaleString": "texte"}.get(c["pim_type"], c["pim_type"])
        if c.get("format") == "hh:mm":
            kind = "heure au format HH:MM (24 h)"
        lines.append(f"- Type : {kind}")
        if c.get("false_is_an_answer"):
            lines.append("- False est une vraie réponse (gratuit) : ne réponds False que si la source le dit.")
        if c.get("instruction"):
            lines.append(f"- Consigne : {c['instruction']}")
        values = allowed.get(c.get("cvl_id") or "", [])
        if values:
            lines.append("- Valeurs autorisées (code = libellé) : " + " ; ".join(f"{k} = {v}" for k, v in values[:MAX_ALLOWED_VALUES]))
        lines.append("")
    return "\n".join(lines)


def run(settings: Settings) -> int:
    if not settings.family:
        raise ValueError("FAMILY is required")
    state = open_state(settings, f"enrich__{settings.family}")
    acquired, previous = state.acquire(settings.run_id, settings.lease_seconds)
    if not acquired:
        logger.info("Family %s already being enriched, nothing to do", settings.family)
        return 0
    try:
        failed = enrich(settings, state, previous.get("targets_hash"))
    except Exception:
        state.release(settings.run_id, success=False)
        raise
    return 1 if failed else 0


def sources_to_read(family_sources: list[str], valid_sources: dict[str, list[str]]) -> list[str]:
    """Sources of the family with at least one validated match, in the family's order."""
    used = {s for sources in valid_sources.values() for s in sources}
    return [s for s in family_sources if s in used]


def load_context(client: bigquery.Client, settings: Settings, targets: dict, fields: list[dict]):
    family_sources = [s for s in targets["sources"] if s in SOURCES]
    valid = bq.rows(client, f"""
        SELECT rid, ARRAY_AGG(DISTINCT source) AS sources
        FROM `{settings.table('matching', 'v_approved_matches')}`
        WHERE source IN UNNEST(@sources)
        GROUP BY rid
    """, {"sources": family_sources})
    valid_sources = {r["rid"]: sorted(r["sources"]) for r in valid}
    rids = sorted(valid_sources)
    # Only the sources with a validated match are read: a source never deposited has no raw table
    read_sources = sources_to_read(family_sources, valid_sources)

    scraped: dict[str, dict[str, dict]] = {}
    for source in read_sources:
        cfg, cols = SOURCES[source], targets["sources"][source]
        select = ", ".join(f"CAST(`{c}` AS STRING) AS `{c}`" for c in cols)
        data = bq.rows(client, f"""
            SELECT LPAD(UPPER(TRIM(CAST(`{cfg['rid']}` AS STRING))), 4, '0') AS rid, {select}
            FROM `{settings.table('raw', source)}`
            WHERE LPAD(UPPER(TRIM(CAST(`{cfg['rid']}` AS STRING))), 4, '0') IN UNNEST(@rids)
            QUALIFY ROW_NUMBER() OVER (PARTITION BY LPAD(UPPER(TRIM(CAST(`{cfg['rid']}` AS STRING))), 4, '0') ORDER BY load_dts DESC) = 1
        """, {"rids": rids})
        for r in data:
            scraped.setdefault(r.pop("rid"), {})[source] = r

    product_fields = [f["pim_field"] for f in fields if f["entity"] == "Product"]
    cols = ", ".join(f"`{c}`" for c in ["entity_id", "ProductRid", *product_fields])
    products = {normalize_rid(r["ProductRid"]): r for r in bq.rows(client, f"SELECT {cols} FROM `{settings.table('raw', 'pim_product')}`")}

    entities: dict[str, dict[str, list[dict]]] = {}
    for et in sorted({f["entity"] for f in fields} - {"Product"}):
        entity_fields = [f["pim_field"] for f in fields if f["entity"] == et]
        cols = ", ".join(f"`{c}`" for c in ["entity_id", "rid", *entity_fields])
        for r in bq.rows(client, f"SELECT {cols} FROM `{settings.table('raw', 'pim_' + et.lower())}`"):
            entities.setdefault(normalize_rid(r.pop("rid")), {}).setdefault(et, []).append(r)
    return valid_sources, scraped, products, entities


def enrich(settings: Settings, state, targets_hash: str | None = None) -> int:
    started = datetime.now(timezone.utc)
    client = bigquery.Client(project=settings.project_id)
    common, family_block, targets = load_enrichment(storage.Client(project=settings.project_id), settings.prompts_bucket, settings.family)
    fields = [f for f in targets["fields"] if f["priority"] in settings.priorities]
    by_field = {f["pim_field"]: f for f in fields}
    version = targets.get("prompt_version", "unknown")

    cvl_ids = sorted({f["cvl_id"] for f in fields if f.get("cvl_id")})
    cvl_rows = bq.rows(client, f"SELECT cvl_id, key, label FROM `{settings.table('raw', 'pim_cvl_values')}` WHERE cvl_id IN UNNEST(@ids) ORDER BY cvl_id, key",
                       {"ids": cvl_ids})
    allowed_list: dict[str, list[tuple[str, str]]] = {}
    for r in cvl_rows:
        allowed_list.setdefault(r["cvl_id"], []).append((r["key"], r["label"]))
    allowed = {k: {c for c, _ in v} for k, v in allowed_list.items()}
    labels = {(r["cvl_id"], r["key"]): r["label"] for r in cvl_rows}
    system_prompt = assemble(common, family_block, render_targets(fields, allowed_list))

    valid_sources, scraped, products, entities = load_context(client, settings, targets, fields)
    done = {(r["rid"], r["source_hash"]) for r in bq.rows(client, f"""
        SELECT DISTINCT rid, source_hash FROM `{settings.table('enhanced', 'enrichments')}` WHERE family = @family
    """, {"family": settings.family})}

    hotels, hotel_target_rows = [], []
    target_context = {"run_id": settings.run_id, "family": settings.family, "computed_at": started}
    for rid, sources in valid_sources.items():
        product = products.get(rid)
        content = {s: c for s, c in scraped.get(rid, {}).items() if s in sources and any(v for v in c.values())}
        if product is None or not content:
            continue
        hotel_targets = core.targets_for_hotel(fields, product, entities.get(rid, {}))
        if not hotel_targets:
            continue
        filled = {f["pim_field"]: product.get(f["pim_field"]) for f in fields
                  if f["entity"] == "Product" and not core.is_empty(f, product.get(f["pim_field"]))}
        h = core.fingerprint(version, settings.priorities, content, hotel_targets, filled)
        hotel = {"rid": rid, "pim_entity_id": product["entity_id"], "sources": content, "validated_sources": ",".join(sorted(content)),
                 "targets": hotel_targets, "filled": filled, "source_hash": h}
        hotel_target_rows += core.target_rows(hotel, hotel_targets, by_field, target_context)
        if (rid, h) not in done:
            hotels.append(hotel)

    to_write, key = core.target_set(hotel_target_rows, target_context)
    if key != targets_hash:
        bq.load(client, settings.table("enhanced", "enrichment_targets"), to_write, bq.schema("enrichment_targets"))
        state.remember(targets_hash=key)
        logger.info("Family %s: %d targets written", settings.family, len(hotel_target_rows))

    pending = len(hotels)
    hotels = hotels[:settings.nb_hotels]
    logger.info("Family %s: %d hotels with validated sources, %d to enrich, %d selected", settings.family, len(valid_sources), pending, len(hotels))
    if not hotels:
        state.release(settings.run_id, success=True, stats={"hotels_to_enrich": 0})
        return 0

    agent = GeminiAgent(settings.project_id, settings.vertex_location, settings.gemini_model, system_prompt, EnrichResponse,
                        settings.max_output_tokens, settings.thinking_level, settings.lease_seconds, AdaptiveLimit(settings.llm_concurrency))
    size = settings.enrich_batch_size
    batches = [hotels[i:i + size] for i in range(0, len(hotels), size)]
    rows, failed = [], 0
    try:
        with ThreadPoolExecutor(max_workers=settings.llm_concurrency) as pool:
            futures = {}
            for n, batch in enumerate(batches, 1):
                batch_id = f"ENR-{settings.family}-{started:%Y%m%d-%H%M%S}-{n:04d}"
                payload = {"lot": batch_id, "hotels": [core.hotel_payload(h["rid"], h["targets"], h["filled"], h["sources"]) for h in batch]}
                futures[pool.submit(agent.ask, payload)] = (batch_id, batch)
            for future in as_completed(futures):
                batch_id, batch = futures[future]
                try:
                    answer = future.result()
                except Exception:
                    logger.exception("Batch %s failed, its %d hotels stay to enrich", batch_id, len(batch))
                    failed += 1
                    continue
                answers = {a.rid: a for a in answer.hotels}
                for h in batch:
                    skipped = [s for s in answer.non_traitees if s.rid == h["rid"]]
                    context = {"run_id": settings.run_id, "batch_id": batch_id, "family": settings.family, "source_hash": h["source_hash"],
                               "llm_model": settings.gemini_model, "prompt_version": version, "enriched_at": started}
                    rows += core.rows_for_hotel(h, h["targets"], answers.get(h["rid"]), skipped, by_field, allowed, labels, context,
                                                settings.enrich_auto_validate_score)
    finally:
        agent.close()

    written = bq.load(client, settings.table("enhanced", "enrichments"), rows, bq.schema("enrichments"))
    stats = {"hotels_to_enrich": pending, "hotels_processed": len(hotels), "failed_batches": failed, "rows": written,
             **{s: sum(r["status"] == s for r in rows) for s in (NEEDS_REVIEW, AUTO_APPROVED, AUTO_REJECTED)},
             **{f"{AUTO_REJECTED}_{c}": sum(r["status"] == AUTO_REJECTED and r["reason"] == c for r in rows)
                for c in sorted({r["reason"] for r in rows if r["status"] == AUTO_REJECTED})}}
    state.release(settings.run_id, success=not failed, stats=stats)
    logger.info("Family %s finished: %s", settings.family, stats)
    return failed


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
