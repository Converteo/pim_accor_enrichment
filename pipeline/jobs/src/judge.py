"""Step 3 - judge agent (brick 2): is the scraped page the PIM hotel's own page? Score 0-100.

Every match is judged, OK ones included, so that each carries a score. A match already judged with the same
fingerprint (source_hash) is not sent again. Then the passing rule (decisions.match_status):
  auto_approved  score >= JUDGE_THRESHOLD_HIGH, verdict same_hotel, no blocking indicator -> goes on to enrichment
  auto_rejected  score <  JUDGE_THRESHOLD_LOW, or the page is in another country         -> never enriched
  needs_review   in between                                                              -> waits for a decision in the app
A match left out of the agent's answer is not written: it is judged again at the next run.
"""

import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from google.cloud import bigquery, storage

import bq
from config import Settings
from decisions import AUTO_APPROVED, AUTO_REJECTED, NEEDS_REVIEW, confidence, match_status
from llm import GeminiAgent
from prompts import load_judge
from schemas_llm import JUDGE_REASONS, VERDICTS, JudgeResponse
from state import open_state
from throttle import AdaptiveLimit

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def to_judge(client: bigquery.Client, settings: Settings) -> list[dict]:
    return bq.rows(client, f"""
        SELECT c.*
        FROM `{settings.table('matching', 'match_candidates')}` c
        LEFT JOIN `{settings.table('matching', 'match_judgments')}` j USING (rid, source, source_hash)
        WHERE j.rid IS NULL
        ORDER BY c.pre_verdict, c.rid
    """)


def item(c: dict) -> dict:
    """What the judge reads about one match (French keys, as in its prompt); empty values are left out."""
    def clean(d):
        return {k: v for k, v in d.items() if v not in (None, "", [])}
    return clean({
        "rid": c["rid"], "source": c["source"],
        "hotel_pim": clean({"nom": c["pim_name"], "nom_commercial": c["pim_commercial_name"], "marque": c["pim_brand"],
                            "ancienne_marque": c["pim_former_brand"], "date_rebranding": c["pim_rebranding_date"],
                            "adresse": c["pim_address"], "ville": c["pim_city"], "pays": c["pim_country"], "statut": c["pim_status"]}),
        "page_scrapee": clean({"nom_en_entree": c["scraped_name"], "ville": c["scraped_city"], "marque": c["scraped_brand"],
                               "pays": c["scraped_country"], "url": c["url"], "nom_lu_dans_la_page": c["page_name"],
                               "pays_de_la_page": c["page_country"], "debut_description": c["description_head"]}),
        "indicateurs": clean({"score_nom": c["name_score"], "ecarts": c["gaps"], "rebranding_connu": c["rebranding"],
                              "page_partagee_avec": c["shared_with"], "pre_verdict": c["pre_verdict"], "pre_motif": c["pre_reason"]}),
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
        state.release(settings.run_id, success=True, stats={"to_judge": 0})
        return 0

    bundle = load_judge(storage.Client(project=settings.project_id), settings.prompts_bucket)
    by_key = {(c["rid"], c["source"]): c for c in todo}
    size = settings.judge_batch_size
    batches = [todo[i:i + size] for i in range(0, len(todo), size)]
    agent = GeminiAgent(settings.project_id, settings.vertex_location, settings.gemini_model, bundle.system_prompt,
                        JudgeResponse, settings.max_output_tokens, settings.thinking_level, settings.lease_seconds,
                        AdaptiveLimit(settings.llm_concurrency))
    rows, failed = [], 0
    try:
        with ThreadPoolExecutor(max_workers=settings.llm_concurrency) as pool:
            futures = {}
            for n, batch in enumerate(batches, 1):
                batch_id = f"JUDGE-{started:%Y%m%d-%H%M%S}-{n:04d}"
                futures[pool.submit(agent.ask, {"lot": batch_id, "rapprochements": [item(c) for c in batch]})] = batch_id
            for future in as_completed(futures):
                batch_id = futures[future]
                try:
                    answer = future.result()
                except Exception:
                    logger.exception("Batch %s failed, its matches will be judged again", batch_id)
                    failed += 1
                    continue
                for j in answer.jugements:
                    c = by_key.get((j.rid, j.source))
                    if c is None:
                        continue
                    verdict = VERDICTS[j.verdict]
                    rows.append({
                        "run_id": settings.run_id, "batch_id": batch_id, "rid": c["rid"], "source": c["source"],
                        "source_hash": c["source_hash"], "pre_verdict": c["pre_verdict"], "pre_reason": c["pre_reason"],
                        "verdict": verdict, "score": j.score, "confidence": confidence(j.score), "reason": JUDGE_REASONS[j.motif],
                        "justification": j.justification,
                        "status": match_status(c["pre_verdict"], c["pre_reason"], verdict, j.score,
                                               settings.judge_threshold_high, settings.judge_threshold_low),
                        "threshold_high": settings.judge_threshold_high, "threshold_low": settings.judge_threshold_low,
                        "llm_model": settings.gemini_model, "prompt_version": bundle.version, "judged_at": started,
                    })
    finally:
        agent.close()

    # One row per match even if the model repeated it
    unique = {(r["rid"], r["source"]): r for r in rows}
    written = bq.load(client, settings.table("matching", "match_judgments"), list(unique.values()), bq.schema("match_judgments"))
    stats = {"to_judge": len(todo), "judged": written, "failed_batches": failed,
             **{s: sum(r["status"] == s for r in unique.values()) for s in (AUTO_APPROVED, NEEDS_REVIEW, AUTO_REJECTED)}}
    state.release(settings.run_id, success=not failed, stats=stats)
    logger.info("Judge finished: %s", stats)
    return failed


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
