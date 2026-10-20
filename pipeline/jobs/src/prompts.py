"""Prompts versioned in the repository (prompts/), synced to the prompts bucket by Cloud Build.

Bucket layout:
  judge/prompt.md, judge/meta.json                                   judge agent
  enrichment/00-bloc-commun.md                                       common block of the enrichment agent
  enrichment/<family>/prompt.md, enrichment/<family>/targets.json  one folder per family of fields
"""

import json
from dataclasses import dataclass

from google.cloud import storage

COMMON_BLOCK = "00-bloc-commun.md"


@dataclass(frozen=True)
class PromptBundle:
    system_prompt: str
    version: str
    targets: dict | None = None


def assemble(*blocks: str) -> str:
    """Stable blocks first, so the shared prefix is cached."""
    return "\n\n".join(b.strip() for b in blocks if b and b.strip()) + "\n"


def _reader(client: storage.Client, bucket_name: str):
    bucket = client.bucket(bucket_name)
    return lambda path: bucket.blob(path).download_as_text(encoding="utf-8")


def load_judge(client: storage.Client, bucket_name: str) -> PromptBundle:
    read = _reader(client, bucket_name)
    meta = json.loads(read("judge/meta.json"))
    return PromptBundle(system_prompt=assemble(read("judge/prompt.md")), version=meta.get("version", "unknown"))


def load_enrichment(client: storage.Client, bucket_name: str, family: str) -> tuple[str, str, dict]:
    """(common block, family block, targets) of a family; the targets block is rendered by enrich.py."""
    read = _reader(client, bucket_name)
    targets = json.loads(read(f"enrichment/{family}/targets.json"))
    return read(f"enrichment/{COMMON_BLOCK}"), read(f"enrichment/{family}/prompt.md"), targets
