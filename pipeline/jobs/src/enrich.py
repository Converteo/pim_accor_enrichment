"""Step 4 - enrichment agent (brick 3), for one family of fields (FAMILLE), launched by the workflow.

1. take the family's lease (Firestore)
2. hotels whose match is validated (valide_auto or valide_humain) for at least one source of the family
3. per hotel: target fields (empty in the PIM, filtered by PRIORITES), content of the validated sources only,
   fingerprint; a hotel already enriched with the same fingerprint is skipped
4. batches of ENRICH_BATCH_SIZE hotels to Gemini, answers checked by the code (enrichment_core)
5. rows appended to enhanced.enrichissements; a failed batch writes nothing and is taken again next run
"""

import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from google.cloud import bigquery, storage

import bq
import enrichment_core as core
from config import Settings
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


def render_targets(champs: list[dict], allowed: dict[str, list[tuple[str, str]]]) -> str:
    """Targets block of the system prompt: one entry per field, with the allowed PIM values (code = label)."""
    lines = ["# Champs cibles de la famille", ""]
    for c in champs:
        lines.append(f"## {c['champ_pim']} ({c['entite']}, {c['priorite']})")
        lines.append(f"- Libellé : {c['libelle']}")
        kind = {"Boolean": "booléen : True ou False", "Integer": "nombre entier", "Double": "nombre",
                "CVL": "liste de valeurs PIM" + (" (plusieurs valeurs possibles, séparées par |)" if c.get("multivalue") else " (une seule valeur)"),
                "String": "texte", "LocaleString": "texte"}.get(c["type_pim"], c["type_pim"])
        if c.get("format") == "hh:mm":
            kind = "heure au format HH:MM (24 h)"
        lines.append(f"- Type : {kind}")
        if c.get("false_est_une_reponse"):
            lines.append("- False est une vraie réponse (gratuit) : ne réponds False que si la source le dit.")
        if c.get("consigne"):
            lines.append(f"- Consigne : {c['consigne']}")
        values = allowed.get(c.get("cvl_id") or "", [])
        if values:
            lines.append("- Valeurs autorisées (code = libellé) : " + " ; ".join(f"{k} = {v}" for k, v in values[:MAX_ALLOWED_VALUES]))
        lines.append("")
    return "\n".join(lines)


def run(settings: Settings) -> int:
    if not settings.famille:
        raise ValueError("FAMILLE is required")
    state = open_state(settings, f"enrich__{settings.famille}")
    acquired, _ = state.acquire(settings.run_id, settings.lease_seconds)
    if not acquired:
        logger.info("Family %s already being enriched, nothing to do", settings.famille)
        return 0
    try:
        failed = enrich(settings, state)
    except Exception:
        state.release(settings.run_id, success=False)
        raise
    return 1 if failed else 0


def load_context(client: bigquery.Client, settings: Settings, targets: dict, champs: list[dict]):
    family_sources = [s for s in targets["sources"] if s in SOURCES]
    valid = bq.rows(client, f"""
        SELECT rid, ARRAY_AGG(DISTINCT source) AS sources
        FROM `{settings.table('matching', 'v_rapprochements_valides')}`
        WHERE source IN UNNEST(@sources)
        GROUP BY rid
    """, {"sources": family_sources})
    valid_sources = {r["rid"]: sorted(r["sources"]) for r in valid}
    rids = sorted(valid_sources)

    scraped: dict[str, dict[str, dict]] = {}
    for source in family_sources:
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

    product_fields = [c["champ_pim"] for c in champs if c["entite"] == "Product"]
    cols = ", ".join(f"`{c}`" for c in ["entity_id", "ProductRid", *product_fields])
    products = {normalize_rid(r["ProductRid"]): r for r in bq.rows(client, f"SELECT {cols} FROM `{settings.table('raw', 'pim_product')}`")}

    entities: dict[str, dict[str, list[dict]]] = {}
    for et in sorted({c["entite"] for c in champs} - {"Product"}):
        fields = [c["champ_pim"] for c in champs if c["entite"] == et]
        cols = ", ".join(f"`{c}`" for c in ["entity_id", "rid", *fields])
        for r in bq.rows(client, f"SELECT {cols} FROM `{settings.table('raw', 'pim_' + et.lower())}`"):
            entities.setdefault(normalize_rid(r.pop("rid")), {}).setdefault(et, []).append(r)
    return valid_sources, scraped, products, entities


def enrich(settings: Settings, state) -> int:
    started = datetime.now(timezone.utc)
    client = bigquery.Client(project=settings.project_id)
    common, family_block, targets = load_enrichment(storage.Client(project=settings.project_id), settings.prompts_bucket, settings.famille)
    champs = [c for c in targets["champs"] if c["priorite"] in settings.priorites]
    by_field = {c["champ_pim"]: c for c in champs}
    version = targets.get("version_prompts", "unknown")

    cvl_ids = sorted({c["cvl_id"] for c in champs if c.get("cvl_id")})
    cvl_rows = bq.rows(client, f"SELECT cvl_id, cle, libelle FROM `{settings.table('raw', 'pim_cvl_values')}` WHERE cvl_id IN UNNEST(@ids) ORDER BY cvl_id, cle",
                       {"ids": cvl_ids})
    allowed_list: dict[str, list[tuple[str, str]]] = {}
    for r in cvl_rows:
        allowed_list.setdefault(r["cvl_id"], []).append((r["cle"], r["libelle"]))
    allowed = {k: {c for c, _ in v} for k, v in allowed_list.items()}
    labels = {(r["cvl_id"], r["cle"]): r["libelle"] for r in cvl_rows}
    system_prompt = assemble(common, family_block, render_targets(champs, allowed_list))

    valid_sources, scraped, products, entities = load_context(client, settings, targets, champs)
    done = {(r["rid"], r["source_hash"]) for r in bq.rows(client, f"""
        SELECT DISTINCT rid, source_hash FROM `{settings.table('enhanced', 'enrichissements')}` WHERE famille = @famille
    """, {"famille": settings.famille})}

    hotels = []
    for rid, sources in valid_sources.items():
        product = products.get(rid)
        content = {s: c for s, c in scraped.get(rid, {}).items() if s in sources and any(v for v in c.values())}
        if product is None or not content:
            continue
        hotel_targets = core.targets_for_hotel(champs, product, entities.get(rid, {}))
        if not hotel_targets:
            continue
        filled = {c["champ_pim"]: product.get(c["champ_pim"]) for c in champs
                  if c["entite"] == "Product" and not core.is_empty(c, product.get(c["champ_pim"]))}
        h = core.fingerprint(version, settings.priorites, content, hotel_targets, filled)
        if (rid, h) in done:
            continue
        hotels.append({"rid": rid, "pim_entity_id": product["entity_id"], "sources": content, "sources_validees": ",".join(sorted(content)),
                       "targets": hotel_targets, "filled": filled, "source_hash": h})

    pending = len(hotels)
    hotels = hotels[:settings.nb_hotels]
    logger.info("Family %s: %d hotels with validated sources, %d to enrich, %d selected", settings.famille, len(valid_sources), pending, len(hotels))
    if not hotels:
        state.release(settings.run_id, success=True, stats={"hotels_a_enrichir": 0})
        return 0

    agent = GeminiAgent(settings.project_id, settings.vertex_location, settings.gemini_model, system_prompt, EnrichResponse,
                        settings.max_output_tokens, settings.thinking_level, settings.lease_seconds, AdaptiveLimit(settings.llm_concurrency))
    size = settings.enrich_batch_size
    lots = [hotels[i:i + size] for i in range(0, len(hotels), size)]
    rows, failed = [], 0
    try:
        with ThreadPoolExecutor(max_workers=settings.llm_concurrency) as pool:
            futures = {}
            for n, lot in enumerate(lots, 1):
                lot_id = f"ENR-{settings.famille}-{started:%Y%m%d-%H%M%S}-{n:04d}"
                payload = {"lot": lot_id, "hotels": [core.hotel_payload(h["rid"], h["targets"], h["filled"], h["sources"]) for h in lot]}
                futures[pool.submit(agent.ask, payload)] = (lot_id, lot)
            for future in as_completed(futures):
                lot_id, lot = futures[future]
                try:
                    answer = future.result()
                except Exception:
                    logger.exception("Batch %s failed, its %d hotels stay to enrich", lot_id, len(lot))
                    failed += 1
                    continue
                answers = {a.rid: a for a in answer.hotels}
                for h in lot:
                    skipped = [s for s in answer.non_traitees if s.rid == h["rid"]]
                    context = {"run_id": settings.run_id, "lot_id": lot_id, "famille": settings.famille, "source_hash": h["source_hash"],
                               "llm_model": settings.gemini_model, "prompt_version": version, "enriched_at": started}
                    rows += core.rows_for_hotel(h, h["targets"], answers.get(h["rid"]), skipped, by_field, allowed, labels, context,
                                                settings.enrich_auto_validate_score)
    finally:
        agent.close()

    written = bq.load(client, settings.table("enhanced", "enrichissements"), rows, bq.schema("enrichissements"))
    stats = {"hotels_a_enrichir": pending, "hotels_traites": len(hotels), "lots_en_echec": failed, "lignes": written,
             **{s: sum(r["statut"] == s for r in rows) for s in ("proposee", "validee_auto", "rejetee", "non_traitee", "ecart", "deja_renseignee")}}
    state.release(settings.run_id, success=not failed, stats=stats)
    logger.info("Family %s finished: %s", settings.famille, stats)
    return failed


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
