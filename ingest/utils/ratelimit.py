"""Free-tier pacing.

Gemini's free tier caps requests per minute *and* per day. A 300-page document
is 300 vision calls; without pacing the run dies partway through and you have
burned the quota anyway. The limiter below is a simple sliding window — it
blocks before the call rather than reacting to a 429.

Pair it with tenacity retries for the 429s that still slip through (shared
quota, clock skew).
"""

from __future__ import annotations

import threading
import time
from collections import deque


class RateLimiter:
    """Allow at most `rpm` calls in any rolling 60-second window."""

    def __init__(self, rpm: int, safety: float = 0.9) -> None:
        # Aim below the stated limit: the server's window and ours never line up
        # exactly, and hitting the cap dead-on produces sporadic 429s.
        self.capacity = max(1, int(rpm * safety))
        self._calls: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self._lock:
                now = time.monotonic()
                while self._calls and now - self._calls[0] >= 60.0:
                    self._calls.popleft()
                if len(self._calls) < self.capacity:
                    self._calls.append(now)
                    return
                wait = 60.0 - (now - self._calls[0]) + 0.05
            time.sleep(wait)

    def __enter__(self) -> RateLimiter:
        self.acquire()
        return self

    def __exit__(self, *exc: object) -> None:
        return None
