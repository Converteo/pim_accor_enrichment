"""Run state of a step in Firestore: lease, last success and stats (same pattern as the Leroy Merlin pipeline).

The lease stops two executions of the same step (or of the same family) from overlapping.
"""

from datetime import datetime, timedelta, timezone

from google.cloud import firestore


class RunState:
    def __init__(self, client: firestore.Client, collection: str, document_id: str):
        self.client = client
        self.ref = client.collection(collection).document(document_id)

    def acquire(self, run_id: str, lease_seconds: int) -> tuple[bool, dict]:
        """Take the lease if free; return (acquired, current document)."""

        @firestore.transactional
        def take(transaction: firestore.Transaction) -> tuple[bool, dict]:
            data = self.ref.get(transaction=transaction).to_dict() or {}
            now = datetime.now(timezone.utc)
            lease_until = data.get("lease_until")
            if lease_until and lease_until > now and data.get("lease_owner") != run_id:
                return False, data
            transaction.set(self.ref, {"lease_owner": run_id, "lease_until": now + timedelta(seconds=lease_seconds)}, merge=True)
            return True, data

        return take(self.client.transaction())

    def release(self, run_id: str, success: bool, stats: dict | None = None) -> None:
        update = {"lease_owner": None, "lease_until": None, "last_run_id": run_id, "last_run_at": firestore.SERVER_TIMESTAMP}
        if success:
            update["last_success_at"] = firestore.SERVER_TIMESTAMP
        if stats is not None:
            update["last_run_stats"] = stats
        self.ref.set(update, merge=True)


def open_state(settings, document_id: str) -> RunState:
    return RunState(firestore.Client(project=settings.project_id, database=settings.firestore_database),
                    settings.firestore_collection, document_id)
