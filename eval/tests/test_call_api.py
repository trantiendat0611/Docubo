"""Tests for call_api's time-to-first-token measurement.

Mocks urllib.request.urlopen with a fake response that hands its body back in
several read() calls, the way a real chunked stream would — a single
response.read() call, which is what call_api used before this, cannot tell
"first byte" from "last byte" apart and would make this untestable.
"""

from __future__ import annotations

from eval import run_eval


class _FakeResponse:
    def __init__(self, headers: dict[str, str], chunks: list[bytes]):
        self.headers = headers
        self._chunks = chunks
        self._i = 0

    def read(self, n: int = -1) -> bytes:
        if n == -1:
            rest = b"".join(self._chunks[self._i :])
            self._i = len(self._chunks)
            return rest
        if self._i >= len(self._chunks):
            return b""
        chunk = self._chunks[self._i]
        self._i += 1
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_ttft_times_the_first_chunk_not_the_whole_body(monkeypatch):
    response = _FakeResponse(
        headers={"content-type": "text/plain; charset=utf-8"},
        chunks=[b"Xin ", b"chao ", b"ban"],
    )
    monkeypatch.setattr(run_eval.urllib.request, "urlopen", lambda *a, **kw: response)

    # sent, then one time.time() call for the first non-empty chunk — later
    # chunks do not call it again, since ttft_ms is only ever set once.
    ticks = iter([100.0, 100.25])
    monkeypatch.setattr(run_eval.time, "time", lambda: next(ticks))

    result = run_eval.call_api("http://x/api/chat", "token", "câu hỏi")

    assert result["answer"] == "Xin chao ban"
    assert result["ttft_ms"] == 250
    assert result["type"] == "answer"


def test_ttft_is_none_for_a_non_streamed_json_response(monkeypatch):
    """A refusal/blocked/error body is one JSON object — there is no first
    token to time, and call_api must return the JSON as-is rather than
    inventing a ttft_ms field for it."""
    response = _FakeResponse(
        headers={"content-type": "application/json"},
        chunks=[b'{"type": "refusal", "message": "khong tim thay"}'],
    )
    monkeypatch.setattr(run_eval.urllib.request, "urlopen", lambda *a, **kw: response)
    monkeypatch.setattr(run_eval.time, "time", lambda: 0.0)

    result = run_eval.call_api("http://x/api/chat", "token", "câu hỏi")

    assert result == {"type": "refusal", "message": "khong tim thay"}
    assert "ttft_ms" not in result


def test_ttft_is_none_when_the_stream_carries_nothing(monkeypatch):
    response = _FakeResponse(
        headers={"content-type": "text/plain; charset=utf-8"}, chunks=[]
    )
    monkeypatch.setattr(run_eval.urllib.request, "urlopen", lambda *a, **kw: response)
    monkeypatch.setattr(run_eval.time, "time", lambda: 0.0)

    result = run_eval.call_api("http://x/api/chat", "token", "câu hỏi")

    assert result["type"] == "empty"
    assert result["ttft_ms"] is None
