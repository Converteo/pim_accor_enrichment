"""Step 3 - judge agent (brick 2): is the scraped page the PIM hotel's own page? Score 0-100.

Every match is judged, OK ones included, so that each carries a score. A match already judged with the same
fingerprint (source_hash) is not sent again. Then the passing rule (decisions.match_status):
  valide_auto  score >= JUDGE_THRESHOLD_HIGH, verdict meme_hotel, no blocking indicator -> goes on to enrichment
  rejete_auto  score <  JUDGE_THRESHOLD_LOW, or the page is in another country        -> never enriched
  a_valider    in between                                                             -> waits for a decision in the app
A match left out of the agent's answer is not written: it is judged again at the next run.
"""

import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from google.cloud import bigquery, storage

import bq
from config import Settings
from decisions import match_status, niveau
from llm import GeminiAgent
from prompts import load_judge
from schemas_llm import JudgeResponse
from state import open_state
from throttle import AdaptiveLimit

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def to_judge(client: bigquery.Client, settings: Settings) -> list[dict]:
    return bq.rows(client, f"""
        SELECT c.*
        FROM `{settings.table('matching', 'candidats')}` c
        LEFT JOIN `{settings.table('matching', 'jugements')}` j USING (rid, source, source_hash)
        WHERE j.rid IS NULL
        ORDER BY c.pre_verdict, c.rid
    """)


def item(c: dict) -> dict:
    """What the judge reads about one match; empty values are left out."""
    def clean(d):
        return {k: v for k, v in d.items() if v not in (None, "", [])}
    return clean({
        "rid": c["rid"], "source": c["source"],
        "hotel_pim": clean({"nom": c["nom_pim"], "nom_commercial": c["nom_commercial_pim"], "marque": c["marque_pim"],
                            "ancienne_marque": c["ancienne_marque_pim"], "date_rebranding": c["date_rebranding_pim"],
                            "adresse": c["adresse_pim"], "ville": c["ville_pim"], "pays": c["pays_pim"], "statut": c["statut_pim"]}),
        "page_scrapee": clean({"nom_en_entree": c["nom_scraping"], "ville": c["ville_scraping"], "marque": c["marque_scraping"],
                               "pays": c["pays_scraping"], "url": c["url"], "nom_lu_dans_la_page": c["page_scrapee"],
                               "pays_de_la_page": c["pays_page"], "debut_description": c["debut_description"]}),
        "indicateurs": clean({"score_nom": c["score_nom"], "ecarts": c["ecarts"], "rebranding_connu": c["rebranding"],
                              "page_partagee_avec": c["partagee_avec"], "pre_verdict": c["pre_verdict"], "pre_motif": c["pre_motif"]}),
    })


def run(settings: Settings) -> int:
    state = open_state(settings, "judge")
    acquired, _ = state.acquire(settings.run_id, settings.lease_seconds)
    if not acquired:
        logger.info("Judge already running, nothing to do")
        return 0
    try:
        failed = judge(settings, state)
    except Exception:
        state.release(settings.run_id, success=False)
        raise
    return 1 if failed else 0


def judge(settings: Settings, state) -> int:
    started = datetime.now(timezone.utc)
    client = bigquery.Client(project=settings.project_id)
    todo = to_judge(client, settings)
    logger.info("%d matches to judge", len(todo))
    if not todo:
        state.release(settings.run_id, success=True, stats={"a_juger": 0})
        return 0

    bundle = load_judge(storage.Client(project=settings.project_id), settings.prompts_bucket)
    by_key = {(c["rid"], c["source"]): c for c in todo}
    size = settings.judge_batch_size
    lots = [todo[i:i + size] for i in range(0, len(todo), size)]
    agent = GeminiAgent(settings.project_id, settings.vertex_location, settings.gemini_model, bundle.system_prompt,
                        JudgeResponse, settings.max_output_tokens, settings.thinking_level, settings.lease_seconds,
                        AdaptiveLimit(settings.llm_concurrency))
    rows, failed = [], 0
    try:
        with ThreadPoolExecutor(max_workers=settings.llm_concurrency) as pool:
            futures = {}
            for n, lot in enumerate(lots, 1):
                lot_id = f"JUGE-{started:%Y%m%d-%H%M%S}-{n:04d}"
                futures[pool.submit(agent.ask, {"lot": lot_id, "rapprochements": [item(c) for c in lot]})] = lot_id
            for future in as_completed(futures):
                lot_id = futures[future]
                try:
                    answer = future.result()
                except Exception:
                    logger.exception("Batch %s failed, its matches will be judged again", lot_id)
                    failed += 1
                    continue
                for j in answer.jugements:
                    c = by_key.get((j.rid, j.source))
                    if c is None:
                        continue
                    rows.append({
                        "run_id": settings.run_id, "lot_id": lot_id, "rid": c["rid"], "source": c["source"],
                        "source_hash": c["source_hash"], "pre_verdict": c["pre_verdict"], "pre_motif": c["pre_motif"],
                        "verdict": j.verdict, "score": j.score, "niveau": niveau(j.score), "motif": j.motif,
                        "justification": j.justification,
                        "statut": match_status(c["pre_verdict"], c["pre_motif"], j.verdict, j.score,
                                               settings.judge_threshold_high, settings.judge_threshold_low),
                        "seuil_haut": settings.judge_threshold_high, "seuil_bas": settings.judge_threshold_low,
                        "llm_model": settings.gemini_model, "prompt_version": bundle.version, "judged_at": started,
                    })
    finally:
        agent.close()

    # One row per match even if the model repeated it
    unique = {(r["rid"], r["source"]): r for r in rows}
    written = bq.load(client, settings.table("matching", "jugements"), list(unique.values()), bq.schema("jugements"))
    stats = {"a_juger": len(todo), "juges": written, "lots_en_echec": failed,
             **{s: sum(r["statut"] == s for r in unique.values()) for s in ("valide_auto", "a_valider", "rejete_auto")}}
    state.release(settings.run_id, success=not failed, stats=stats)
    logger.info("Judge finished: %s", stats)
    return failed


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
