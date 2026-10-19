"""Gemini on Vertex AI, shared by the judge and the enrichment agents (taken from the Leroy Merlin pipeline).

- system prompt cached once per run, deleted at the end
- JSON answer forced by a Pydantic schema, validated on return
- retries with exponential backoff on saturation, network errors and invalid answers
- adaptive concurrency (throttle.AdaptiveLimit)
"""

import json
import logging
import random
import re
import time
from contextlib import nullcontext

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from throttle import AdaptiveLimit

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 6
RETRYABLE_STATUS = {429, 500, 503, 504}
SATURATION_STATUS = {429, 503}
MAX_BACKOFF_SECONDS = 60
REQUEST_TIMEOUT_MS = 300_000
# The model sometimes returns a control character instead of an accented letter
CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


class CorruptedResponse(ValueError):
    pass


class GeminiAgent:
    def __init__(self, project_id: str, location: str, model: str, system_prompt: str, response_schema: type[BaseModel],
                 max_output_tokens: int, thinking_level: str | None, cache_ttl_seconds: int, limit: AdaptiveLimit | None = None):
        self.limit = limit
        self.response_schema = response_schema
        self.client = genai.Client(vertexai=True, project=project_id, location=location,
                                   http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS))
        self.model = model
        self.cache_name = self._create_cache(system_prompt, cache_ttl_seconds)
        self.config = types.GenerateContentConfig(
            cached_content=self.cache_name,
            system_instruction=None if self.cache_name else system_prompt,
            max_output_tokens=max_output_tokens,
            response_mime_type="application/json",
            response_schema=response_schema,
            thinking_config=types.ThinkingConfig(thinking_level=thinking_level) if thinking_level else None,
        )

    def _create_cache(self, system_prompt: str, ttl_seconds: int) -> str | None:
        try:
            cache = self.client.caches.create(
                model=self.model,
                config=types.CreateCachedContentConfig(system_instruction=system_prompt, ttl=f"{ttl_seconds}s"),
            )
            logger.info("System prompt cached as %s", cache.name)
            return cache.name
        except errors.APIError as e:
            # Below the minimum cacheable size the prompt is sent with each batch
            logger.warning("System prompt not cached (%s %s), sent with each batch", e.code, e.message)
            return None

    def close(self) -> None:
        if self.cache_name:
            try:
                self.client.caches.delete(name=self.cache_name)
            except errors.APIError as e:
                logger.warning("Cache %s not deleted (%s), it expires on its own", self.cache_name, e.code)

    def ask(self, payload: dict) -> BaseModel:
        lot = payload.get("lot", "?")
        contents = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                with self.limit or nullcontext():
                    started = time.monotonic()
                    response = self.client.models.generate_content(model=self.model, contents=contents, config=self.config)
                if self.limit:
                    self.limit.succeeded()
                usage = response.usage_metadata
                logger.info("Batch %s: %.1fs, tokens in=%s cached=%s out=%s thinking=%s", lot, time.monotonic() - started,
                            usage.prompt_token_count, usage.cached_content_token_count,
                            usage.candidates_token_count, usage.thoughts_token_count)
                text = response.text or ""
                if CONTROL_CHARACTERS.search(text):
                    raise CorruptedResponse("control characters in the response")
                return self.response_schema.model_validate_json(text)
            except errors.APIError as e:
                if self.limit and e.code in SATURATION_STATUS:
                    self.limit.saturated()
                if e.code not in RETRYABLE_STATUS or attempt == MAX_ATTEMPTS:
                    raise
                logger.warning("Batch %s: Vertex error %s, attempt %d/%d", lot, e.code, attempt, MAX_ATTEMPTS)
            except httpx.TransportError as e:
                if attempt == MAX_ATTEMPTS:
                    raise
                logger.warning("Batch %s: network error %s, attempt %d/%d", lot, type(e).__name__, attempt, MAX_ATTEMPTS)
            except (ValidationError, CorruptedResponse) as e:
                if attempt == MAX_ATTEMPTS:
                    raise
                reason = e.error_count() if isinstance(e, ValidationError) else e
                logger.warning("Batch %s: invalid response (%s), attempt %d/%d", lot, reason, attempt, MAX_ATTEMPTS)
            time.sleep(min(MAX_BACKOFF_SECONDS, 2 ** (attempt + 1)) + random.random())
        raise RuntimeError("unreachable")
