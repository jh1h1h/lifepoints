"""Authenticated Docs operations; every mutation is a Firestore transaction."""

import hashlib
import json
import re
from datetime import datetime, timezone

from firebase_functions import https_fn
from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter

from docs_delta import HistoryError, content_hash, format_deltas, make_patch, reconstruct_history

ERROR = https_fn.FunctionsErrorCode
ENTITY_TYPES = {"friend", "project"}
CHANGE_TYPES = {"correction", "new_information", "unspecified"}
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,100}$")


def fail(code, message):
    raise https_fn.HttpsError(code, message)


def string(value, field, maximum, allow_empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not allow_empty and not value.strip()):
        fail(ERROR.INVALID_ARGUMENT, f"{field} must be a valid string (maximum {maximum} characters).")
    return value


def aliases(value):
    if not isinstance(value, list) or len(value) > 30:
        fail(ERROR.INVALID_ARGUMENT, "aliases must be a list of at most 30 names.")
    result = []
    for alias in value:
        clean = string(alias, "alias", 120).strip()
        if clean.casefold() not in [item.casefold() for item in result]:
            result.append(clean)
    return result


def public_record(snapshot):
    data = snapshot.to_dict()
    return {"id": snapshot.id, **{key: value.isoformat() if isinstance(value, datetime) else value
                                  for key, value in data.items()}}


def operation_data(data, action):
    operation_id = data.get("operationId")
    if not isinstance(operation_id, str) or not ID_PATTERN.fullmatch(operation_id):
        fail(ERROR.INVALID_ARGUMENT, "A unique operationId is required.")
    expected = data.get("expectedRevision")
    if action != "create" and (type(expected) is not int or expected < 1):
        fail(ERROR.INVALID_ARGUMENT, "expectedRevision must be a positive integer.")
    if action != "create":
        entity_id = data.get("entityId")
        if not isinstance(entity_id, str) or not ID_PATTERN.fullmatch(entity_id):
            fail(ERROR.INVALID_ARGUMENT, "A valid entityId is required.")
    return operation_id


def run_mutation(db, uid, action, data):
    if action not in {"create", "update_content", "rename", "update_aliases", "delete"}:
        fail(ERROR.INVALID_ARGUMENT, "Unknown Docs action.")
    operation_id = operation_data(data, action)
    if action == "create":
        entity_type = data.get("entityType")
        if entity_type not in ENTITY_TYPES:
            fail(ERROR.INVALID_ARGUMENT, "entityType must be friend or project.")
        name = string(data.get("name"), "name", 120).strip()
        content = string(data.get("content", ""), "content", 200000, True)
        alias_list = aliases(data.get("aliases", []))
    elif action == "update_content":
        content = string(data.get("content"), "content", 200000, True)
    elif action == "rename":
        name = string(data.get("name"), "name", 120).strip()
    elif action == "update_aliases":
        alias_list = aliases(data.get("aliases"))
    change_type = data.get("changeType", "unspecified")
    if change_type not in CHANGE_TYPES:
        fail(ERROR.INVALID_ARGUMENT, "Invalid changeType.")
    description = string(data.get("description", ""), "description", 500, True)

    user_ref = db.collection("users").document(uid)
    docs = user_ref.collection("docs")
    operation_ref = user_ref.collection("docOperations").document(operation_id)
    entity_ref = docs.document() if action == "create" else docs.document(data["entityId"])
    request_hash = hashlib.sha256(json.dumps({"action": action, "data": data}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    transaction = db.transaction()

    @firestore.transactional
    def commit(tx):
        previous = operation_ref.get(transaction=tx)
        if previous.exists:
            recorded = previous.to_dict()
            if recorded["requestHash"] != request_hash:
                fail(ERROR.ALREADY_EXISTS, "This operation ID was used for a different request.")
            return {**recorded["result"], "alreadyProcessed": True}

        current = None if action == "create" else entity_ref.get(transaction=tx)
        if action != "create" and (not current.exists or current.to_dict()["deleted"]):
            fail(ERROR.NOT_FOUND, "Document not found or already deleted.")
        prior = current.to_dict() if current else None
        if prior and prior["revision"] != data["expectedRevision"]:
            fail(ERROR.ABORTED, "This document changed elsewhere. Reload it before saving.")

        now = datetime.now(timezone.utc)
        if action == "create":
            updated = {"entityType": entity_type, "name": name, "normalizedName": name.casefold(),
                       "aliases": alias_list, "content": content, "revision": 1, "deleted": False,
                       "createdAt": now, "updatedAt": now}
            before_content, after_content, base_revision = "", content, 0
            changed = True
        else:
            updated = dict(prior)
            before_content = prior["content"]
            after_content = content if action == "update_content" else before_content
            if action == "update_content":
                updated["content"] = after_content
            elif action == "rename":
                updated["name"] = name
                updated["normalizedName"] = name.casefold()
            elif action == "update_aliases":
                updated["aliases"] = alias_list
            elif action == "delete":
                updated["deleted"] = True
            changed = any(updated[key] != prior[key] for key in ("name", "aliases", "content", "deleted"))
            base_revision = prior["revision"]
            if changed:
                updated["revision"] = base_revision + 1
                updated["updatedAt"] = now

        result = {"id": entity_ref.id, "revision": updated["revision"], "changed": changed}
        if changed:
            patch = make_patch(before_content, after_content)
            event = {"eventId": operation_id, "operation": action, "baseRevision": base_revision,
                     "newRevision": updated["revision"], "patch": patch,
                     "beforeHash": content_hash(before_content), "afterHash": content_hash(after_content),
                     "source": "manual", "changeType": change_type, "description": description,
                     "timestamp": now, "beforeName": prior["name"] if prior else "",
                     "afterName": updated["name"], "beforeAliases": prior["aliases"] if prior else [],
                     "afterAliases": updated["aliases"]}
            tx.set(entity_ref, updated)
            tx.create(entity_ref.collection("edits").document(operation_id), event)
        tx.create(operation_ref, {"requestHash": request_hash, "result": result, "createdAt": now})
        return result

    return commit(transaction)


def run_read(db, uid, action, data):
    docs = db.collection("users").document(uid).collection("docs")
    if action == "list":
        entity_type = data.get("entityType")
        if entity_type not in ENTITY_TYPES:
            fail(ERROR.INVALID_ARGUMENT, "entityType must be friend or project.")
        return {"entities": sorted((public_record(doc) for doc in docs.where(filter=FieldFilter("entityType", "==", entity_type)).stream()
                                    if not doc.to_dict()["deleted"]), key=lambda item: (item["normalizedName"], item["id"]))}
    entity_id = data.get("entityId")
    if not isinstance(entity_id, str) or not ID_PATTERN.fullmatch(entity_id):
        fail(ERROR.INVALID_ARGUMENT, "A valid entityId is required.")
    snapshot = docs.document(entity_id).get()
    if not snapshot.exists:
        fail(ERROR.NOT_FOUND, "Document not found.")
    if action == "get":
        return {"entity": public_record(snapshot)}
    if action == "history":
        events = [public_record(edit) for edit in docs.document(entity_id).collection("edits").stream()]
        try:
            versions = reconstruct_history(events)
            if len(events) != snapshot.to_dict()["revision"] or versions[-1] != snapshot.to_dict()["content"]:
                raise HistoryError("Current document does not match its edit history")
            formatted = format_deltas(events)
        except HistoryError as exc:
            fail(ERROR.DATA_LOSS, str(exc))
        return {"edits": sorted(events, key=lambda event: event["newRevision"]), "formatted": formatted}
    fail(ERROR.INVALID_ARGUMENT, "Unknown Docs action.")


def handle(db, uid, data):
    if not uid:
        fail(ERROR.UNAUTHENTICATED, "Sign in to use Docs.")
    if not isinstance(data, dict):
        fail(ERROR.INVALID_ARGUMENT, "Request must be an object.")
    action = data.get("action")
    if action in {"create", "update_content", "rename", "update_aliases", "delete"}:
        return run_mutation(db, uid, action, data)
    return run_read(db, uid, action, data)
