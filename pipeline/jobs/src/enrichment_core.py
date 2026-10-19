"""Pure logic of the enrichment agent (brick 3): targets of a hotel, payload, controls of the answer, row statuses.

No Google client here: unit tested as is.
"""

import hashlib
import json
import re
import unicodedata
import uuid

from decisions import DEJA_RENSEIGNEE, ECART, NON_TRAITEE, PROPOSEE, REJETEE, enrichment_status, niveau

NEW_ENTITY = "nouvelle"
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
EXTRACT_CAP_SCORE = 50  # score kept when the cited excerpt is not found in the source
MAX_EXTRACT_PART = 3


# ------------------------------------------------------------------ targets

def is_true(value) -> bool:
    return str(value).strip().lower() in ("true", "1", "yes")


def is_empty(champ: dict, value) -> bool:
    """A boolean at FALSE is the PIM default, so it is a target, except where FALSE is an answer (charged: no = free)."""
    if value in (None, ""):
        return True
    if champ["type_pim"] == "Boolean" and not champ.get("false_est_une_reponse"):
        return not is_true(value)
    return False


def targets_for_hotel(champs: list[dict], product: dict, entities: dict[str, list[dict]]) -> list[dict]:
    """Fields to fill for one hotel.

    product: raw.pim_product row; entities: entity type -> raw.pim_<entity> rows of the hotel.
    A multi-value list is always a target (missing values are added); a linked entity field is a target on each
    existing entity where it is empty, or on a new entity when the hotel has none of that type.
    """
    targets = []
    for c in champs:
        if c["entite"] == "Product":
            value = product.get(c["champ_pim"])
            if is_empty(c, value) or (c.get("multivalue") and c["type_pim"] == "CVL"):
                targets.append({"champ_pim": c["champ_pim"], "entite": "Product", "id_entite": None, "valeur_pim": value or None})
            continue
        rows = entities.get(c["entite"], [])
        if not rows:
            targets.append({"champ_pim": c["champ_pim"], "entite": c["entite"], "id_entite": NEW_ENTITY, "valeur_pim": None})
        for e in rows:
            value = e.get(c["champ_pim"])
            if is_empty(c, value) or (c.get("multivalue") and c["type_pim"] == "CVL"):
                targets.append({"champ_pim": c["champ_pim"], "entite": c["entite"], "id_entite": e["entity_id"], "valeur_pim": value or None})
    return targets


def fingerprint(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


def hotel_payload(rid: str, targets: list[dict], filled: dict, sources: dict[str, dict]) -> dict:
    """What the agent reads about one hotel; empty values are left out."""
    return {
        "rid": rid,
        "cibles": [{k: v for k, v in t.items() if v not in (None, "")} for t in targets],
        "valeurs_pim_renseignees": {k: v for k, v in filled.items() if v not in (None, "")},
        "sources": {s: {k: v for k, v in cols.items() if v not in (None, "")} for s, cols in sources.items()},
    }


# ------------------------------------------------------------------ controls

def _norm(text) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", text).strip()


def extract_found(extrait: str | None, source_text: str | None) -> bool:
    """The cited excerpt is in the cited source field (parts split on « ... » each found)."""
    if not extrait or not source_text:
        return False
    haystack = _norm(source_text)
    parts = [p.strip(" .,;:") for p in re.split(r"\.{3}|…", _norm(extrait))]
    parts = [p for p in parts if p][:MAX_EXTRACT_PART]
    return bool(parts) and all(p in haystack for p in parts)


def check_value(champ: dict, valeur: str, allowed: set[str]) -> tuple[str | None, str | None]:
    """(normalised value, None) or (None, reason of the rejection)."""
    v = str(valeur or "").strip()
    if not v:
        return None, "valeur vide"
    t = champ["type_pim"]
    if champ.get("format") == "hh:mm":
        m = re.match(r"^(\d{1,2}):(\d{2})$", v)
        v = f"{int(m.group(1)):02d}:{m.group(2)}" if m else v
        return (v, None) if HHMM.match(v) else (None, f"format HH:MM attendu : {valeur!r}")
    if t == "Boolean":
        if v.lower() in ("true", "false"):
            return ("True" if v.lower() == "true" else "False"), None
        return None, f"booléen attendu : {valeur!r}"
    if t in ("Integer", "Double"):
        try:
            number = float(v.replace(",", "."))
        except ValueError:
            return None, f"nombre attendu : {valeur!r}"
        if number < 0:
            return None, f"nombre négatif : {valeur!r}"
        return (str(int(number)) if t == "Integer" else f"{number:g}"), None
    if t == "CVL":
        keys = [k.strip() for k in re.split(r"[|;,]", v) if k.strip()]
        unknown = [k for k in keys if k not in allowed]
        if unknown:
            return None, f"hors de la liste PIM : {', '.join(unknown)}"
        if not champ.get("multivalue") and len(keys) > 1:
            return None, "une seule valeur attendue"
        return "|".join(dict.fromkeys(keys)), None
    return v, None


def compare_with_pim(champ: dict, valeur: str, valeur_pim) -> tuple[str, str | None, str | None]:
    """(status, value to write, reason) once the value is valid: never overwrite the PIM."""
    if champ.get("multivalue") and champ["type_pim"] == "CVL":
        current = set(str(valeur_pim or "").split("|")) - {""}
        new = [k for k in valeur.split("|") if k not in current]
        if not new:
            return DEJA_RENSEIGNEE, None, "valeurs déjà dans le PIM"
        return PROPOSEE, "|".join(new), ("ajout à la liste du PIM" if current else None)
    if is_empty(champ, valeur_pim):
        return PROPOSEE, valeur, None
    if str(valeur_pim) == valeur or (champ["type_pim"] == "Boolean" and is_true(valeur_pim) == is_true(valeur)):
        return DEJA_RENSEIGNEE, None, None
    return ECART, valeur, f"le PIM contient {valeur_pim!r}"


# ------------------------------------------------------------------ rows

def rows_for_hotel(hotel: dict, targets: list[dict], answer, skipped: list, champs: dict[str, dict],
                   allowed: dict[str, set[str]], labels: dict[tuple[str, str], str], context: dict,
                   auto_threshold: int | None) -> list[dict]:
    """Rows of one hotel from the agent's answer (answer: HotelEnrichi or None).

    hotel: rid, pim_entity_id, sources (source -> column -> text), sources_validees
    Several existing entities of one type (parkings, pools): a value given for some of them only is applied to
    all of them, in doubt.
    """
    by_target = {(t["champ_pim"], t["id_entite"]): t for t in targets}
    proposed: dict[tuple[str, str | None], object] = {}
    for v in (answer.valeurs if answer else []):
        key = (v.champ_pim, v.id_entite if champs.get(v.champ_pim, {}).get("entite") != "Product" else None)
        if key not in by_target and champs.get(v.champ_pim, {}).get("entite") not in (None, "Product"):
            # A new entity numbered by the agent (nouvelle_1, nouvelle_2...)
            if str(v.id_entite or "").startswith(NEW_ENTITY) and (v.champ_pim, NEW_ENTITY) in by_target:
                key = (v.champ_pim, v.id_entite)
                by_target.setdefault(key, {**by_target[(v.champ_pim, NEW_ENTITY)], "id_entite": v.id_entite})
        if key in by_target:
            proposed[key] = v

    # In doubt, a value given for some existing entities only is applied to the others
    for (champ_pim, id_entite), t in list(by_target.items()):
        if (champ_pim, id_entite) in proposed or id_entite in (None,) or str(id_entite).startswith(NEW_ENTITY):
            continue
        siblings = [proposed[k] for k in proposed if k[0] == champ_pim and k[1] and not str(k[1]).startswith(NEW_ENTITY)]
        if siblings and len({s.valeur for s in siblings}) == 1:
            proposed[(champ_pim, id_entite)] = siblings[0].model_copy(update={"id_entite": id_entite, "alerte": (
                (siblings[0].alerte + " ; ") if siblings[0].alerte else "") + "valeur appliquée à toutes les entités, dans le doute"})

    skipped_keys = {(s.champ_pim, s.id_entite): s.motif for s in skipped}
    rows = []
    for key, t in by_target.items():
        if key[1] == NEW_ENTITY and any(k[0] == key[0] and str(k[1]).startswith(NEW_ENTITY + "_") for k in proposed):
            continue  # replaced by the numbered new entities
        champ = champs[t["champ_pim"]]
        base = {**context, "enrichment_id": uuid.uuid4().hex, "rid": hotel["rid"], "pim_entity_id": hotel["pim_entity_id"],
                "entite": t["entite"], "id_entite": t["id_entite"], "champ_pim": t["champ_pim"], "libelle": champ.get("libelle"),
                "priorite": champ.get("priorite"), "valeur_pim": t["valeur_pim"], "sources_validees": hotel["sources_validees"]}
        v = proposed.get(key)
        if v is None:
            rows.append({**base, "statut": NON_TRAITEE, "motif": skipped_keys.get(key) or skipped_keys.get((key[0], None))
                         or "absent de la réponse du modèle"})
            continue
        source_text = hotel["sources"].get(v.source, {}).get(v.champ_source or "", None)
        found = extract_found(v.extrait_source, source_text)
        score = v.score if found else min(v.score, EXTRACT_CAP_SCORE)
        alerte = v.alerte if found else "; ".join(filter(None, [v.alerte, "extrait introuvable dans la source citée"]))
        value, reason = check_value(champ, v.valeur, allowed.get(champ.get("cvl_id") or "", set()))
        common = {**base, "methode": v.methode, "source": v.source, "champ_source": v.champ_source,
                  "extrait_source": v.extrait_source, "extrait_trouve": found, "score": score, "niveau": niveau(score), "alerte": alerte or None}
        if value is None:
            rows.append({**common, "statut": REJETEE, "valeur": v.valeur, "motif": reason})
            continue
        status, to_write, motif = compare_with_pim(champ, value, t["valeur_pim"])
        label = None
        if to_write and champ.get("cvl_id"):
            label = " | ".join(labels.get((champ["cvl_id"], k), k) for k in to_write.split("|"))
        rows.append({**common, "statut": enrichment_status(status, score, alerte, auto_threshold), "valeur": to_write,
                     "libelle_valeur": label, "motif": motif})
    return rows
