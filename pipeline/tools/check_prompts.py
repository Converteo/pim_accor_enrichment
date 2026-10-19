"""Check the prompts tree before it is synced to the bucket (run by cloudbuild.yaml at the root of the repository).

    python tools/check_prompts.py prompts
"""

import json
import sys
from pathlib import Path

REQUIRED_FIELD_KEYS = {"champ_pim", "entite", "libelle", "type_pim", "cvl_id", "multivalue", "priorite"}


def check(root: Path) -> list[str]:
    errors = []
    for path in ("judge/prompt.md", "judge/meta.json", "enrichment/00-bloc-commun.md"):
        if not (root / path).is_file():
            errors.append(f"missing {path}")
    families = [d for d in (root / "enrichment").iterdir() if d.is_dir()]
    if not families:
        errors.append("no family folder under enrichment/")
    for d in families:
        if not (d / "prompt.md").is_file():
            errors.append(f"missing {d.name}/prompt.md")
        try:
            targets = json.loads((d / "targets.json").read_text())
        except (OSError, ValueError) as e:
            errors.append(f"{d.name}/targets.json unreadable: {e}")
            continue
        if not targets.get("version_prompts") or not targets.get("sources") or not targets.get("champs"):
            errors.append(f"{d.name}/targets.json needs version_prompts, sources and champs")
        for c in targets.get("champs", []):
            if REQUIRED_FIELD_KEYS - c.keys():
                errors.append(f"{d.name}: {c.get('champ_pim')} misses {sorted(REQUIRED_FIELD_KEYS - c.keys())}")
            if c.get("priorite") not in ("P1", "P2", "P3"):
                errors.append(f"{d.name}: {c.get('champ_pim')} has priority {c.get('priorite')!r}")
    return errors


if __name__ == "__main__":
    problems = check(Path(sys.argv[1] if len(sys.argv) > 1 else "prompts"))
    for p in problems:
        print(p)
    sys.exit(1 if problems else 0)
