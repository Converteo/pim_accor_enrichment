"""Statuses of a match and of an enrichment, and the passing rules between the steps.

Match (RID x source):
  valide_auto    the judge agent is confident        -> goes on to enrichment
  a_valider      in between                           -> waits for a human decision in the app
  rejete_auto    the judge agent rejects, or the page is in another country -> never enriched
  valide_humain / rejete_humain   decision taken in the app; always wins over the agent

Enrichment (hotel x field x entity):
  proposee -> validee | invalidee | corrigee in the app (validee_auto only if a threshold is set)
"""

from matching_rules import MOTIF_OTHER_COUNTRY, REJECTED

VALIDE_AUTO, A_VALIDER, REJETE_AUTO = "valide_auto", "a_valider", "rejete_auto"
VALIDE_HUMAIN, REJETE_HUMAIN = "valide_humain", "rejete_humain"
MATCH_PASSES = {VALIDE_AUTO, VALIDE_HUMAIN}

PROPOSEE, REJETEE, NON_TRAITEE, ECART, DEJA_RENSEIGNEE = "proposee", "rejetee", "non_traitee", "ecart", "deja_renseignee"
VALIDEE_AUTO = "validee_auto"


def niveau(score: int) -> str:
    return "haut" if score >= 80 else "moyen" if score >= 50 else "bas"


def match_status(pre_verdict: str, pre_motif: str | None, verdict: str, score: int, high: int, low: int) -> str:
    """Passing rule of the judge agent's answer."""
    if pre_motif == MOTIF_OTHER_COUNTRY or score < low:
        return REJETE_AUTO
    if score >= high and verdict == "meme_hotel" and pre_verdict != REJECTED:
        return VALIDE_AUTO
    return A_VALIDER


def enrichment_status(status: str, score: int | None, alerte: str | None, auto_threshold: int | None) -> str:
    """Optional automatic validation of a proposed value (off while auto_threshold is None)."""
    if status == PROPOSEE and auto_threshold is not None and score is not None and score >= auto_threshold and not alerte:
        return VALIDEE_AUTO
    return status
