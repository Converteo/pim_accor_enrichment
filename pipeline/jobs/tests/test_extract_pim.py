"""Guards of the PIM extraction: how many calls reach the API when it refuses, saturates or times out (fake API)."""

import sys
import threading
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import extract_pim as ex  # noqa: E402
from throttle import AdaptiveLimit  # noqa: E402


class Resp:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body, headers or {}

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


class FakeSession:
    """Answers each call with handler(body); counts the calls."""

    def __init__(self, handler):
        self.handler, self.headers, self.calls = handler, {}, []
        self._lock = threading.Lock()

    def request(self, method, url, json=None, timeout=None):
        with self._lock:
            self.calls.append(json)
        result = self.handler(json)
        if isinstance(result, Exception):
            raise result
        return result


def client(handler, workers=1):
    session = FakeSession(handler)
    return ex.PimClient("key", AdaptiveLimit(workers, "PIM API"), session=session, sleep=lambda s: None), session


def hotels(body):
    return Resp(200, [{"entityId": i} for i in body["entityIds"]])


def test_refused_key_stops_at_the_first_call():
    pim, session = client(lambda body: Resp(401))
    with pytest.raises(ex.PimAuthError):
        list(ex.fetch_all(pim, [[1, 2], [3, 4], [5, 6]], {}, workers=1))
    assert len(session.calls) == 1


def test_refused_key_with_parallel_batches_sends_at_most_the_calls_in_flight():
    pim, session = client(lambda body: Resp(403), workers=4)
    batches = [list(range(i, i + 20)) for i in range(0, 7800, 20)]
    with pytest.raises(ex.PimAuthError):
        list(ex.fetch_all(pim, batches, {}, workers=4))
    assert len(session.calls) <= 4  # 390 batches, at most the 4 already sent


def test_saturated_api_is_retried_then_stops_without_splitting():
    pim, session = client(lambda body: Resp(503, headers={"Retry-After": "7"}))
    waits = []
    pim.sleep = waits.append
    with pytest.raises(ex.PimUnavailable):
        list(ex.fetch_all(pim, [list(range(20)), list(range(20, 40))], {}, workers=1))
    assert len(session.calls) == ex.RETRIES
    assert waits == [7.0] * (ex.RETRIES - 1)
    assert pim.limit.limit == 1


def test_timed_out_batch_is_split_until_it_passes():
    def handler(body):
        return requests.exceptions.ReadTimeout() if len(body["entityIds"]) > 5 else hotels(body)

    pim, session = client(handler)
    result = list(ex.fetch_all(pim, [list(range(20))], {"objects": "x"}, workers=1))
    assert [h["entityId"] for h in result[0]] == list(range(20))
    assert len(session.calls) == 1 + 2 + 4  # 20 -> 2 x 10 -> 4 x 5


def test_batches_come_back_in_order_with_the_light_request():
    pim, session = client(hotels, workers=4)
    batches = [list(range(i, i + 20)) for i in range(0, 100, 20)]
    result = list(ex.fetch_all(pim, batches, {"fieldTypeIds": "ProductRid", "outbound": {"linkTypeIds": "ProductPool"}}))
    assert [h["entityId"] for r in result for h in r] == list(range(100))
    assert len(session.calls) == 5
    assert all(c["fieldTypeIds"] == "ProductRid" and c["outbound"]["linkTypeIds"] == "ProductPool" for c in session.calls)


def test_only_read_posts_are_allowed():
    pim, session = client(hotels)
    with pytest.raises(PermissionError):
        pim.read_post("/v1.0.0/entities", {})
    assert session.calls == []


def test_waits_for_the_running_extraction_then_reuses_it():
    class State:
        def __init__(self):
            self.attempts = 0

        def acquire(self, run_id, lease_seconds):
            self.attempts += 1
            return (self.attempts == 3, {"last_success_at": "just now"} if self.attempts == 3 else {})

    state, waits = State(), []
    data = ex.acquire_or_wait(state, "run-2", 3600, sleep=waits.append, clock=lambda: 0)
    assert data == {"last_success_at": "just now"} and waits == [ex.WAIT_POLL] * 2
