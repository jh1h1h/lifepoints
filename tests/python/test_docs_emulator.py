import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from firebase_functions import https_fn
from google.cloud import firestore

from docs_delta import reconstruct_history
from docs_service import handle


pytestmark = pytest.mark.skipif(not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Firestore emulator required")


@pytest.fixture
def context():
    return firestore.Client(project="demo-lifepoints"), f"test-{uuid.uuid4().hex}"


def create(db, uid, name="Kevin", entity_type="friend", content="Employment:\nApple\n"):
    return handle(db, uid, {"action": "create", "operationId": str(uuid.uuid4()),
                            "entityType": entity_type, "name": name, "content": content})


def mutate(db, uid, entity_id, revision, action, **values):
    return handle(db, uid, {"action": action, "operationId": str(uuid.uuid4()),
                            "entityId": entity_id, "expectedRevision": revision, **values})


def test_create_duplicate_names_and_arbitrary_content(context):
    db, uid = context
    first = create(db, uid, content="\nAny heading 🍎:\nLine one\nLine two")
    second = create(db, uid, content="", entity_type="project")
    third = create(db, uid)
    assert first["id"] != third["id"]
    assert handle(db, uid, {"action": "get", "entityId": first["id"]})["entity"]["content"].endswith("Line two")
    assert handle(db, uid, {"action": "get", "entityId": second["id"]})["entity"]["content"] == ""
    assert len(handle(db, uid, {"action": "list", "entityType": "friend"})["entities"]) == 2
    edits = handle(db, uid, {"action": "history", "entityId": second["id"]})["edits"]
    assert len(edits) == 1 and edits[0]["source"] == "manual"


def test_revisions_metadata_delete_and_idempotency(context):
    db, uid = context
    created = create(db, uid)
    entity_id = created["id"]
    result = mutate(db, uid, entity_id, 1, "update_content", content="Employment:\nMicrosoft\n", changeType="correction")
    assert result["revision"] == 2
    operation = str(uuid.uuid4())
    request = {"action": "rename", "operationId": operation, "entityId": entity_id, "expectedRevision": 2, "name": "Kevin H"}
    first = handle(db, uid, request)
    second = handle(db, uid, request)
    assert first["revision"] == second["revision"] == 3 and second["alreadyProcessed"]
    with pytest.raises(https_fn.HttpsError):
        handle(db, uid, {**request, "name": "Different"})
    assert mutate(db, uid, entity_id, 3, "update_aliases", aliases=["Kev", "K"])["revision"] == 4
    assert not mutate(db, uid, entity_id, 4, "update_content", content="Employment:\nMicrosoft\n")["changed"]
    assert mutate(db, uid, entity_id, 4, "delete")["revision"] == 5
    assert handle(db, uid, {"action": "list", "entityType": "friend"})["entities"] == []
    events = handle(db, uid, {"action": "history", "entityId": entity_id})["edits"]
    assert [event["newRevision"] for event in events] == [1, 2, 3, 4, 5]
    assert events[1]["changeType"] == "correction"
    assert events[-1]["operation"] == "delete"
    assert reconstruct_history(events)[-1] == "Employment:\nMicrosoft\n"
    assert handle(db, uid, {"action": "get", "entityId": entity_id})["entity"]["deleted"]


def test_stale_concurrent_and_failed_transaction(context):
    db, uid = context
    entity_id = create(db, uid)["id"]
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(mutate, db, uid, entity_id, 1, "update_content", content=f"Version {n}") for n in (1, 2)]
        outcomes = []
        for future in futures:
            try:
                outcomes.append(future.result())
            except https_fn.HttpsError as exc:
                outcomes.append(exc)
    assert sum(isinstance(outcome, dict) for outcome in outcomes) == 1
    assert sum(isinstance(outcome, https_fn.HttpsError) for outcome in outcomes) == 1
    assert len(handle(db, uid, {"action": "history", "entityId": entity_id})["edits"]) == 2
    assert handle(db, uid, {"action": "get", "entityId": entity_id})["entity"]["revision"] == 2
    with pytest.raises(https_fn.HttpsError):
        mutate(db, uid, entity_id, 1, "rename", name="Stale")
    assert len(handle(db, uid, {"action": "history", "entityId": entity_id})["edits"]) == 2


def test_uid_scoping_and_unauthenticated(context):
    db, uid = context
    entity_id = create(db, uid)["id"]
    other = f"other-{uuid.uuid4().hex}"
    with pytest.raises(https_fn.HttpsError):
        handle(db, other, {"action": "get", "entityId": entity_id})
    with pytest.raises(https_fn.HttpsError):
        mutate(db, other, entity_id, 1, "delete")
    with pytest.raises(https_fn.HttpsError):
        handle(db, None, {"action": "list", "entityType": "friend"})
