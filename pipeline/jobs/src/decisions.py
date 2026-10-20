"""Statuses of a match and of an enrichment, and the passing rules between the steps.

Match (RID x source):
  auto_approved    the judge agent is confident        -> goes on to enrichment
  needs_review     in between                           -> waits for a human decision in the app
  auto_rejected    the judge agent rejects, or the page is in another country -> never enriched
  human_approved / human_rejected   decision taken in the app; always wins over the agent
  pending_judgment not judged yet (views only)

Enrichment (hotel x field x entity):
  proposed -> approved | rejected | corrected in the app (auto_approved only if a threshold is set)
  conflict      the source gives another value than the PIM (the PIM is never overwritten)
  matches_pim   the source confirms the PIM value
  not_found     nothing in the sources (reason given)
  discarded     the agent's answer failed the controls (code not in the PIM list, no excerpt...)
"""

from matching_rules import REASON_OTHER_COUNTRY, REJECTED

AUTO_APPROVED, NEEDS_REVIEW, AUTO_REJECTED = "auto_approved", "needs_review", "auto_rejected"
HUMAN_APPROVED, HUMAN_REJECTED = "human_approved", "human_rejected"
PENDING_JUDGMENT = "pending_judgment"
MATCH_PASSES = {AUTO_APPROVED, HUMAN_APPROVED}

PROPOSED, DISCARDED, NOT_FOUND, CONFLICT, MATCHES_PIM = "proposed", "discarded", "not_found", "conflict", "matches_pim"
VALUE_AUTO_APPROVED = "auto_approved"
APPROVED, REJECTED_BY_HUMAN, CORRECTED = "approved", "rejected", "corrected"


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
    if status == PROPOSED and auto_threshold is not None and score is not None and score >= auto_threshold and not warning:
        return VALUE_AUTO_APPROVED
    return status
