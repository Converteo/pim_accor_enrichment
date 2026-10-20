"""Statuses of a match and of an enrichment, and the passing rules between the steps.

Both follow one convention: needs_review waits for a human, auto_* is decided by the machine, human_* by a reviewer
in the app (a human decision always wins). reason is a code; the French text read by the reviewers is next to it.

Match (RID x source), reason = the judge agent's code (former_brand, neighbouring_hotel...):
  auto_approved    the judge agent is confident        -> goes on to enrichment
  needs_review     in between                           -> waits for a human decision in the app
  auto_rejected    the judge agent rejects, or the page is in another country -> never enriched
  human_approved / human_rejected
  pending_judgment not judged yet (views only)

Enrichment (hotel x field x entity), reason_detail = the French text:
  pending_enrichment  target of an approved match not enriched yet, or whose content changed (views only)
  needs_review     value proposed for an empty field, with its excerpt
  auto_approved    only if a threshold is set (off)
  auto_rejected    reason: not_in_sources, model_omitted, already_in_pim, pim_conflict (the PIM is never overwritten),
                   no_excerpt, not_in_pim_list, invalid_format
  human_approved / human_rejected / human_corrected
"""

from matching_rules import REASON_OTHER_COUNTRY, REJECTED

AUTO_APPROVED, NEEDS_REVIEW, AUTO_REJECTED = "auto_approved", "needs_review", "auto_rejected"
HUMAN_APPROVED, HUMAN_REJECTED = "human_approved", "human_rejected"
PENDING_JUDGMENT, PENDING_ENRICHMENT = "pending_judgment", "pending_enrichment"
MATCH_PASSES = {AUTO_APPROVED, HUMAN_APPROVED}

HUMAN_CORRECTED = "human_corrected"

# Why a value is auto_rejected
NOT_IN_SOURCES, MODEL_OMITTED = "not_in_sources", "model_omitted"
ALREADY_IN_PIM, PIM_CONFLICT = "already_in_pim", "pim_conflict"
NO_EXCERPT, NOT_IN_PIM_LIST, INVALID_FORMAT = "no_excerpt", "not_in_pim_list", "invalid_format"


def confidence(score: int) -> str:
    return "high" if score >= 80 else "medium" if score >= 50 else "low"


def match_status(pre_verdict: str, pre_reason: str | None, verdict: str, score: int, high: int, low: int) -> str:
    """Passing rule of the judge agent's answer (verdict already translated: same_hotel, different_hotel, undetermined)."""
    if pre_reason == REASON_OTHER_COUNTRY or score < low:
        return AUTO_REJECTED
    if score >= high and verdict == "same_hotel" and pre_verdict != REJECTED:
        return AUTO_APPROVED
    return NEEDS_REVIEW


def enrichment_status(status: str, score: int | None, warning: str | None, auto_threshold: int | None) -> str:
    """Optional automatic validation of a proposed value (off while auto_threshold is None)."""
    if status == NEEDS_REVIEW and auto_threshold is not None and score is not None and score >= auto_threshold and not warning:
        return AUTO_APPROVED
    return status
