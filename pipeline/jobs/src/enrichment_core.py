"""Pure logic of the enrichment agent (brick 3): targets of a hotel, payload, controls of the answer, row statuses.

No Google client here: unit tested as is. The agent reads and answers with French keys (its prompt is in French):
hotel_payload and rows_for_hotel are the only places that speak its language.
"""

import hashlib
import json
import re
import unicodedata
import uuid

from decisions import CONFLICT, DISCARDED, MATCHES_PIM, NOT_FOUND, PROPOSED, confidence, enrichment_status
from schemas_llm import AGENT_NEW_ENTITY, METHODS

NEW_ENTITY = "new"
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
EXTRACT_CAP_SCORE = 50  # score kept when the cited excerpt is not found in the source
MAX_EXTRACT_PART = 10  # parts of a cited excerpt checked in the source

# Reasons and warnings are read by the Accor reviewers in the app: they stay in French


# ------------------------------------------------------------------ targets

def is_true(value) -> bool:
    return str(value).strip().lower() in ("true", "1", "yes")


def is_new(entity_id) -> bool:
    return str(entity_id or "").startswith(NEW_ENTITY)


def is_empty(field: dict, value) -> bool:
    """A boolean at FALSE is the PIM default, so it is a target, except where FALSE is an answer (charged: no = free)."""
    if value in (None, ""):
        return True
    if field["pim_type"] == "Boolean" and not field.get("false_is_an_answer"):
        return not is_true(value)
    return False


def targets_for_hotel(fields: list[dict], product: dict, entities: dict[str, list[dict]]) -> list[dict]:
    """Fields to fill for one hotel.

    product: raw.pim_product row; entities: entity type -> raw.pim_<entity> rows of the hotel.
    A multi-value list is always a target (missing values are added); a linked entity field is a target on each
    existing entity where it is empty, or on a new entity when the hotel has none of that type.
    """
    targets = []
    for f in fields:
        always = f.get("multivalue") and f["pim_type"] == "CVL"
        if f["entity"] == "Product":
            value = product.get(f["pim_field"])
            if is_empty(f, value) or always:
                targets.append({"pim_field": f["pim_field"], "entity": "Product", "entity_id": None, "pim_value": value or None})
            continue
        rows = entities.get(f["entity"], [])
        if not rows:
            targets.append({"pim_field": f["pim_field"], "entity": f["entity"], "entity_id": NEW_ENTITY, "pim_value": None})
        for e in rows:
            value = e.get(f["pim_field"])
            if is_empty(f, value) or always:
                targets.append({"pim_field": f["pim_field"], "entity": f["entity"], "entity_id": e["entity_id"], "pim_value": value or None})
    return targets


def fingerprint(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


def to_agent_entity(entity_id: str | None) -> str | None:
    return AGENT_NEW_ENTITY + entity_id[len(NEW_ENTITY):] if is_new(entity_id) else entity_id


def from_agent_entity(entity_id: str | None) -> str | None:
    if str(entity_id or "").startswith(AGENT_NEW_ENTITY):
        return NEW_ENTITY + entity_id[len(AGENT_NEW_ENTITY):]
    return entity_id


def hotel_payload(rid: str, targets: list[dict], filled: dict, sources: dict[str, dict]) -> dict:
    """What the agent reads about one hotel, with the French keys of its prompt; empty values are left out."""
    cibles = [{"champ_pim": t["pim_field"], "entite": t["entity"], "id_entite": to_agent_entity(t["entity_id"]),
               "valeur_pim": t["pim_value"]} for t in targets]
    return {
        "rid": rid,
        "cibles": [{k: v for k, v in c.items() if v not in (None, "")} for c in cibles],
        "valeurs_pim_renseignees": {k: v for k, v in filled.items() if v not in (None, "")},
        "sources": {s: {k: v for k, v in cols.items() if v not in (None, "")} for s, cols in sources.items()},
    }


# ------------------------------------------------------------------ controls

def _norm(text) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", text).strip()


def extract_found(excerpt: str | None, source_text: str | None) -> bool:
    """The cited excerpt is in the cited source field (parts split on « ... » or « ; », each found)."""
    if not excerpt or not source_text:
        return False
    haystack = _norm(source_text)
    parts = [p.strip(" .,;:") for p in re.split(r"\.{3}|…|;", _norm(excerpt))]
    parts = [p for p in parts if p][:MAX_EXTRACT_PART]
    return bool(parts) and all(p in haystack for p in parts)


def check_value(field: dict, value: str, allowed: set[str]) -> tuple[str | None, str | None]:
    """(normalised value, None) or (None, reason of the rejection)."""
    v = str(value or "").strip()
    if not v:
        return None, "valeur vide"
    t = field["pim_type"]
    if field.get("format") == "hh:mm":
        m = re.match(r"^(\d{1,2}):(\d{2})$", v)
        v = f"{int(m.group(1)):02d}:{m.group(2)}" if m else v
        return (v, None) if HHMM.match(v) else (None, f"format HH:MM attendu : {value!r}")
    if t == "Boolean":
        if v.lower() in ("true", "false"):
            return ("True" if v.lower() == "true" else "False"), None
        return None, f"booléen attendu : {value!r}"
    if t in ("Integer", "Double"):
        try:
            number = float(v.replace(",", "."))
        except ValueError:
            return None, f"nombre attendu : {value!r}"
        if number < 0:
            return None, f"nombre négatif : {value!r}"
        return (str(int(number)) if t == "Integer" else f"{number:g}"), None
    if t == "CVL":
        keys = [k.strip() for k in re.split(r"[|;,]", v) if k.strip()]
        unknown = [k for k in keys if k not in allowed]
        if unknown:
            return None, f"hors de la liste PIM : {', '.join(unknown)}"
        if not field.get("multivalue") and len(keys) > 1:
            return None, "une seule valeur attendue"
        return "|".join(dict.fromkeys(keys)), None
    return v, None


def compare_with_pim(field: dict, value: str, pim_value) -> tuple[str, str | None, str | None]:
    """(status, value to write, reason) once the value is valid: never overwrite the PIM."""
    if field.get("multivalue") and field["pim_type"] == "CVL":
        current = set(str(pim_value or "").split("|")) - {""}
        new = [k for k in value.split("|") if k not in current]
        if not new:
            return MATCHES_PIM, None, "valeurs déjà dans le PIM"
        return PROPOSED, "|".join(new), ("ajout à la liste du PIM" if current else None)
    if is_empty(field, pim_value):
        return PROPOSED, value, None
    if str(pim_value) == value or (field["pim_type"] == "Boolean" and is_true(pim_value) == is_true(value)):
        return MATCHES_PIM, None, None
    return CONFLICT, value, f"le PIM contient {pim_value!r}"


# ------------------------------------------------------------------ rows

def rows_for_hotel(hotel: dict, targets: list[dict], answer, skipped: list, fields: dict[str, dict],
                   allowed: dict[str, set[str]], labels: dict[tuple[str, str], str], context: dict,
                   auto_threshold: int | None) -> list[dict]:
    """Rows of one hotel from the agent's answer (answer: HotelEnrichi or None; skipped: its NonTraitee items).

    hotel: rid, pim_entity_id, sources (source -> column -> text), validated_sources
    Several existing entities of one type (parkings, pools): a value given for some of them only is applied to
    all of them, in doubt.
    """
    by_target = {(t["pim_field"], t["entity_id"]): t for t in targets}
    proposed: dict[tuple[str, str | None], object] = {}
    for v in (answer.valeurs if answer else []):
        entity = fields.get(v.champ_pim, {}).get("entity")
        key = (v.champ_pim, from_agent_entity(v.id_entite) if entity != "Product" else None)
        if key not in by_target and entity not in (None, "Product"):
            # A new entity numbered by the agent (new_1, new_2...)
            if is_new(key[1]) and (v.champ_pim, NEW_ENTITY) in by_target:
                by_target.setdefault(key, {**by_target[(v.champ_pim, NEW_ENTITY)], "entity_id": key[1]})
        if key in by_target:
            proposed[key] = v

    # In doubt, a value given for some existing entities only is applied to the others
    for (pim_field, entity_id), t in list(by_target.items()):
        if (pim_field, entity_id) in proposed or entity_id is None or is_new(entity_id):
            continue
        siblings = [proposed[k] for k in proposed if k[0] == pim_field and k[1] and not is_new(k[1])]
        if siblings and len({s.valeur for s in siblings}) == 1:
            proposed[(pim_field, entity_id)] = siblings[0].model_copy(update={"alerte": (
                (siblings[0].alerte + " ; ") if siblings[0].alerte else "") + "valeur appliquée à toutes les entités, dans le doute"})

    skipped_reasons = {(s.champ_pim, from_agent_entity(s.id_entite)): s.motif for s in skipped}
    rows = []
    for key, t in by_target.items():
        if key[1] == NEW_ENTITY and any(k[0] == key[0] and str(k[1]).startswith(NEW_ENTITY + "_") for k in proposed):
            continue  # replaced by the numbered new entities
        field = fields[t["pim_field"]]
        base = {**context, "enrichment_id": uuid.uuid4().hex, "rid": hotel["rid"], "pim_entity_id": hotel["pim_entity_id"],
                "entity": t["entity"], "entity_id": t["entity_id"], "pim_field": t["pim_field"], "label": field.get("label"),
                "priority": field.get("priority"), "pim_value": t["pim_value"], "validated_sources": hotel["validated_sources"]}
        v = proposed.get(key)
        if v is None:
            rows.append({**base, "status": NOT_FOUND, "reason": skipped_reasons.get(key) or skipped_reasons.get((key[0], None))
                         or "absent de la réponse du modèle"})
            continue
        method = METHODS[v.methode]
        if not (v.extrait_source or "").strip():
            # No excerpt, no value: missing information is never a False or a default
            rows.append({**base, "status": DISCARDED, "value": v.valeur, "method": method, "source": v.source,
                         "score": 0, "confidence": confidence(0), "reason": "pas d'extrait de la source"})
            continue
        source_text = hotel["sources"].get(v.source, {}).get(v.champ_source or "", None)
        found = extract_found(v.extrait_source, source_text)
        score = v.score if found else min(v.score, EXTRACT_CAP_SCORE)
        warning = v.alerte if found else "; ".join(filter(None, [v.alerte, "extrait introuvable dans la source citée"]))
        value, reason = check_value(field, v.valeur, allowed.get(field.get("cvl_id") or "", set()))
        common = {**base, "method": method, "source": v.source, "source_field": v.champ_source,
                  "source_excerpt": v.extrait_source, "excerpt_found": found, "score": score, "confidence": confidence(score),
                  "warning": warning or None}
        if value is None:
            rows.append({**common, "status": DISCARDED, "value": v.valeur, "reason": reason})
            continue
        status, to_write, reason = compare_with_pim(field, value, t["pim_value"])
        value_label = None
        if to_write and field.get("cvl_id"):
            value_label = " | ".join(labels.get((field["cvl_id"], k), k) for k in to_write.split("|"))
        rows.append({**common, "status": enrichment_status(status, score, warning, auto_threshold), "value": to_write,
                     "value_label": value_label, "reason": reason})
    return rows
