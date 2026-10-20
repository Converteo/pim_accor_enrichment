"""Deterministic matching rules between a scraped hotel row and its PIM hotel (brick 1, no AI).

Ported from the audit script controle_rapprochement.py: same normalisation, same scores, same verdicts,
so that the pipeline reproduces the audit figures (4 913 OK, 765 à valider, 34 rejetés).
Pure functions only: no Google client is imported here, the module is unit tested as is.
"""

import difflib
import re
import unicodedata

OK, TO_CHECK, REJECTED = "ok", "to_check", "rejected"
RANK = {REJECTED: 0, TO_CHECK: 1, OK: 2}

# Reasons are read by the Accor reviewers in the app: they stay in French
REASON_LABEL_GAP = "Écart de libellé"
REASON_OTHER_COUNTRY = "Homonyme dans un autre pays"
REASON_OTHER_HOTEL = "Page attribuée à un autre hôtel"
REASON_SHARED = "Page partagée avec un autre RID, attribution ambiguë"
REASON_UNREADABLE = "Fiche sans nom lisible : page non vérifiable"

# Words that say nothing about a hotel's identity (generic words or brand names)
STOPWORDS = {
    "hotel", "hotels", "the", "and", "by", "de", "des", "du", "la", "le", "les", "et", "at", "of", "a", "an", "&",
    "managed", "ac", "resort", "resorts", "spa", "suites", "suite", "collection", "mgallery", "no", "brand",
    "ibis", "styles", "budget", "novotel", "mercure", "grand", "sofitel", "pullman", "fairmont", "swissotel",
    "movenpick", "raffles", "rixos", "adagio", "access", "aparthotel", "hotelf1", "f1", "mantra", "peppers",
    "art", "series", "tribe", "jo", "joe", "mama", "shelter", "greet", "hyde", "mondrian", "sls", "delano",
    "banyan", "tree", "angsana", "orient", "express", "emblems", "handwritten", "faena", "ennismore",
    "21c", "museum", "sebel", "breakfree", "quay", "living", "luxury", "legend", "so",
}
# Exonyms and location words, brought back to one (English) form
WORD_ALIASES = {
    "firenze": "florence", "muenchen": "munich", "munchen": "munich", "wien": "vienna", "roma": "rome",
    "antwerpen": "antwerp", "milano": "milan", "napoli": "naples", "venezia": "venice", "torino": "turin",
    "koeln": "cologne", "koln": "cologne", "praha": "prague", "warszawa": "warsaw", "lisboa": "lisbon",
    "bruxelles": "brussels", "brussel": "brussels", "geneve": "geneva", "genf": "geneva", "sevilla": "seville",
    "kobenhavn": "copenhagen", "athina": "athens", "nuernberg": "nuremberg", "nurnberg": "nuremberg", "genova": "genoa",
    "basel": "basle", "zuerich": "zurich", "duesseldorf": "dusseldorf", "krakow": "cracow",
    "centro": "center", "centre": "center", "zentrum": "center", "centrum": "center", "nord": "north", "norte": "north",
    "sud": "south", "sur": "south", "est": "east", "ost": "east", "este": "east", "ouest": "west", "oeste": "west",
    "aeroporto": "airport", "aeroport": "airport", "aeropuerto": "airport", "flughafen": "airport", "apt": "airport",
    "gare": "station", "bahnhof": "station", "estacion": "station", "stazione": "station", "messe": "fair",
}
COUNTRY_ALIASES = {
    "mainland china": "china", "the netherlands": "netherlands", "united states of america": "united states",
    "usa": "united states", "uk": "united kingdom", "great britain": "united kingdom", "hong kong sar": "hong kong",
    "korea republic of": "south korea", "korea south republic": "south korea", "laos": "lao people s democratic republic",
    "republic of korea": "south korea", "korea": "south korea", "russian federation": "russia", "viet nam": "vietnam",
    "czech republic": "czechia", "turkiye": "turkey",
}
# Why a Booking URL does not carry the PIM name
DOUBT_CAUSES = [
    ("Encodage cassé dans l'URL", r"\bha tel\b|a1 4|\bra c\b|\bpa c\b|\bhya res\b|\bsa te\b|gena ve|ma c la|le laumia"),
    ("Nom Accor abrégé dans l'URL", r"^(?:nov|nvtl|merc|sofitel|accor\b|pullman|ibis)"),
    ("Ancienne enseigne dans l'URL", r"\betap\b|all seasons|ramada|jarvis|best ?west|^bw|^inter\b|comfort|logis|relais|citotel|"
     r"balladins|akena|kyriad|park inn|quality|choicehotels|holiday|expresshi|sercotel|eurostars|iberostar|rydges|"
     r"moathouse|hanover|minotel|campanile|fasthotel|soft inn|plaza inn|concorde|astoria|premiere classe"),
    ("Translittération chinoise / japonaise dans l'URL", r"jiu dian|noboteru|hiyori|daiichi|hoiyue|san teh"),
    ("Code ou identifiant dans l'URL", r"^aa\d|\d{3}|^op$|^mm$"),
]
DOUBT_DEFAULT = "Nom de la page différent (ancien nom indépendant, ou mauvaise page)"


def normalize_rid(code) -> str:
    """Excel dropped the leading zeros of the scrapings: 952 -> 0952."""
    code = re.sub(r"\s+", "", str(code or "")).upper()
    return code.zfill(4) if code else ""


def ascii_lower(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", " ", s.lower())


def tokens(s) -> list[str]:
    return [WORD_ALIASES.get(t, t) for t in ascii_lower(s).split() if t not in STOPWORDS and len(t) > 1]


def fuzzy_in(tok: str, pool) -> bool:
    return any(tok == p or (len(tok) > 3 and difflib.SequenceMatcher(None, tok, p).ratio() >= 0.85) for p in pool)


def name_score(scraped, pim_names) -> float | None:
    """Share of the scraped name's distinctive words found in the PIM names (name, commercial name, city)."""
    toks = tokens(scraped)
    if not toks:
        return None
    pool = {t for n in pim_names for t in tokens(n)}
    return sum(fuzzy_in(t, pool) for t in toks) / len(toks)


def same_text(a, b) -> bool | None:
    a, b = ascii_lower(a).strip(), ascii_lower(b).strip()
    if not a or not b:
        return None
    a, b = COUNTRY_ALIASES.get(a, a), COUNTRY_ALIASES.get(b, b)
    a = " ".join(WORD_ALIASES.get(t, t) for t in a.split())
    b = " ".join(WORD_ALIASES.get(t, t) for t in b.split())
    return a == b or a in b or b in a or difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def brand_ok(scraped, pim_brand) -> bool | None:
    a, b = ascii_lower(scraped).split(), ascii_lower(pim_brand).split()
    if not a or not b:
        return None
    ca, cb = "".join(a), "".join(b)
    return bool(set(a) & set(b)) or ca in cb or cb in ca


def doubt_cause(found) -> str:
    s = str(found or "").lower()
    for label, pattern in DOUBT_CAUSES:
        if re.search(pattern, s):
            return label
    return DOUBT_DEFAULT


def identity_check(pim: dict, scraped: dict) -> dict:
    """Level 1: does the RID point to the same hotel? Compares name, city, brand and country.

    pim: name, commercial_name, city, brand, old_brand, country (labels)
    scraped: name, city, brand, country (None when the source has no such column)
    """
    names = [pim.get("name"), pim.get("commercial_name"), pim.get("city")]
    ns = name_score(scraped.get("name"), names)
    city = same_text(scraped.get("city"), pim.get("city"))
    if city is False:
        # The scraped city is often inside the hotel name ("ibis Paris Gare de Lyon")
        first = (tokens(scraped.get("city")) or [""])[0]
        city = bool(first) and fuzzy_in(first, set(tokens(pim.get("name")) + tokens(pim.get("commercial_name")))) or False
    brand = brand_ok(scraped.get("brand"), pim.get("brand"))
    country = same_text(scraped.get("country"), pim.get("country")) if scraped.get("country") is not None else None
    fails = [k for k, v in (("ville", city), ("marque", brand), ("pays", country)) if v is False]
    rebranded = brand is False and bool(pim.get("old_brand"))
    name_ok = ns is not None and ns >= 0.5
    explained = [k for k in fails if not (k == "marque" and rebranded) and not (k == "ville" and ns is not None and ns >= 0.8)]
    if name_ok and not explained:
        verdict, reason = OK, None
    else:
        verdict = TO_CHECK
        gaps = fails if name_ok else ["nom", *fails]
        reason = f"{REASON_LABEL_GAP} : {', '.join(gaps)}"
    return {"verdict": verdict, "reason": reason, "name_score": None if ns is None else round(ns, 2),
            "gaps": ", ".join(fails), "rebranding": rebranded}


def booking_page(url) -> tuple[str | None, str | None, str | None]:
    """(page key, country code, name) read in a Booking URL /hotel/<cc>/<name>.html."""
    m = re.search(r"(/hotel/(\w+)/([^.?]+))", str(url or ""))
    if not m:
        return None, None, None
    return m.group(1), m.group(2).upper(), m.group(3).replace("-", " ")


def expedia_page(about) -> str | None:
    """The Expedia description starts with the property name."""
    return str(about).split(",")[0] if isinstance(about, str) and about.strip() else None


def page_check(pim: dict, found: str | None, page_cc: str | None) -> dict:
    """Level 2: is the scraped page the hotel's own page? pim needs country_code (PIM key, ISO 2)."""
    if not found:
        return {"verdict": TO_CHECK, "reason": REASON_UNREADABLE, "rank": 0.0}
    compact = re.sub(r"[^a-z0-9]", "", ascii_lower(found))
    words = {t for t in ascii_lower(f"{pim.get('name')} {pim.get('commercial_name')}").split() if len(t) > 2 and t not in STOPWORDS}
    score = sum(t in compact for t in words) / len(words) if words else 0
    brand = re.sub(r"[^a-z0-9]", "", ascii_lower(pim.get("brand"))).replace("hotels", "")[:5]
    city = re.sub(r"[^a-z0-9]", "", ascii_lower(pim.get("city")))[:5]
    pim_cc = (pim.get("country_code") or "").upper() or None
    ns = name_score(found, [pim.get("name"), pim.get("commercial_name"), pim.get("city")]) or 0
    # Overlap both ways, to decide between hotels sharing one page
    slug_toks = tokens(found)
    name_toks = set(tokens(pim.get("name")) + tokens(pim.get("commercial_name")))
    cover = sum(fuzzy_in(t, name_toks) for t in slug_toks) / len(slug_toks) if slug_toks else 0
    rank = max(score, ns) + cover
    if page_cc and pim_cc and page_cc != pim_cc and {page_cc, pim_cc} != {"GB", "UK"}:
        return {"verdict": REJECTED, "reason": REASON_OTHER_COUNTRY, "rank": rank}
    if score >= 0.5 or ns >= 0.5:
        return {"verdict": OK, "reason": None, "rank": rank}
    if (brand and brand in compact) or (city and city in compact):
        return {"verdict": OK, "reason": None, "rank": rank}
    return {"verdict": TO_CHECK, "reason": doubt_cause(found), "rank": rank}


def resolve_shared_pages(rows: list[dict]) -> None:
    """One Booking page given to several RIDs: only the RID that matches the URL best keeps it.

    rows carry page_key, page_verdict, page_reason, page_rank, rid; updated in place (+ shared_with).
    """
    by_page: dict[str, list[dict]] = {}
    for r in rows:
        if r.get("page_key"):
            by_page.setdefault(r["page_key"], []).append(r)
    for group in by_page.values():
        if len(group) < 2:
            continue
        for r in group:
            r["shared_with"] = ", ".join(sorted(o["rid"] for o in group if o is not r))
        contenders = [r for r in group if r["page_reason"] != REASON_OTHER_COUNTRY]
        if len(contenders) < 2:
            continue
        best = max(r["page_rank"] for r in contenders)
        winners = [r for r in contenders if r["page_rank"] == best]
        for r in contenders:
            if len(winners) > 1 or best < 1:
                r["page_verdict"], r["page_reason"] = TO_CHECK, REASON_SHARED
            elif r not in winners:
                r["page_verdict"], r["page_reason"] = REJECTED, REASON_OTHER_HOTEL


def combine(identity_verdict: str, identity_reason: str | None, page_verdict: str | None, page_reason: str | None) -> tuple[str, str | None]:
    """Pre-verdict = the least favourable of the identity check and the page check."""
    if page_verdict is None or RANK[identity_verdict] <= RANK[page_verdict]:
        return identity_verdict, identity_reason
    return page_verdict, page_reason
