"""Number of calls sent at the same time to a saturable API (Gemini on Vertex, the PIM API), adapted to its saturation.

Calls run under a limit between 1 and the configured concurrency. A saturation
error (429, 503) halves the limit; a few successful calls in a row raise it by one. On busy days
the job runs 1 or 2 batches at a time instead of piling up retries; on quiet nights it runs at full
concurrency.
"""

import logging
import threading

logger = logging.getLogger(__name__)

RAISE_AFTER = 3  # successful calls in a row before one more batch runs at the same time


class AdaptiveLimit:
    def __init__(self, maximum: int, name: str = "Vertex"):
        self.maximum = self.limit = max(1, maximum)
        self.name = name
        self.active = 0
        self.successes = 0
        self._condition = threading.Condition()

    def __enter__(self) -> "AdaptiveLimit":
        with self._condition:
            while self.active >= self.limit:
                self._condition.wait()
            self.active += 1
        return self

    def __exit__(self, *exc) -> None:
        with self._condition:
            self.active -= 1
            self._condition.notify_all()

    def saturated(self) -> None:
        with self._condition:
            self.successes = 0
            if self.limit > 1:
                self.limit //= 2
                logger.info("%s saturated: %d call(s) at a time", self.name, self.limit)

    def succeeded(self) -> None:
        with self._condition:
            self.successes += 1
            if self.successes >= RAISE_AFTER and self.limit < self.maximum:
                self.limit += 1
                self.successes = 0
                logger.info("%s responding: %d call(s) at a time", self.name, self.limit)
                self._condition.notify_all()
