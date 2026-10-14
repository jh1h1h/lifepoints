"""Authenticated section-based Docs operations."""

import hashlib
import json
import re
from datetime import datetime, timezone

from firebase_functions import https_fn
from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter

ERROR = https_fn.FunctionsErrorCode
ENTITY_TYPES = {"friend", "project"}
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
    for item in value:
        clean = string(item, "alias", 120).strip()
        if clean.casefold() not in [saved.casefold() for saved in result]:
            result.append(clean)
    return result


def _iso(value):
    return value.isoformat() if isinstance(value, datetime) else value


def public_record(snapshot):
    return {"id": snapshot.id, **{key: _iso(value) for key, value in snapshot.to_dict().items()}}


def public_entity(snapshot):
    item = public_record(snapshot)
    item.setdefault("unreadCount", 1 if item.get("content") and item.get("entityType") == "friend" else 0)
    item.setdefault("sectionCount", 1 if item.get("content") else 0)
    item.setdefault("latestSectionAt", item.get("updatedAt") if item.get("content") else None)
    item.pop("content", None)
    return item


def public_section(snapshot, entity):
    item = public_record(snapshot)
    item.update({"entityId": entity["id"], "entityType": entity["entityType"], "entityName": entity["name"]})
    return item


def _operation_id(data):
    value = data.get("operationId")
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        fail(ERROR.INVALID_ARGUMENT, "A unique operationId is required.")
    return value


def _entity_id(data):
    value = data.get("entityId")
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        fail(ERROR.INVALID_ARGUMENT, "A valid entityId is required.")
    return value


def _section_id(data):
    value = data.get("sectionId")
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        fail(ERROR.INVALID_ARGUMENT, "A valid sectionId is required.")
    return value


def run_mutation(db, uid, action, data):
    allowed = {"create", "add_section", "update_section", "set_section_pinned",
               "set_section_unread", "rename", "update_aliases", "delete"}
    if action not in allowed:
        fail(ERROR.INVALID_ARGUMENT, "Unknown Docs action.")
    operation_id = _operation_id(data)
    user = db.collection("users").document(uid)
    docs = user.collection("docs")
    operation_ref = user.collection("docOperations").document(operation_id)
    entity_ref = docs.document() if action == "create" else docs.document(_entity_id(data))
    section_ref = None
    if action in {"update_section", "set_section_pinned", "set_section_unread"}:
        section_ref = entity_ref.collection("sections").document(_section_id(data))
    elif action in {"create", "add_section"}:
        section_ref = entity_ref.collection("sections").document()

    expected = data.get("expectedRevision")
    if action not in {"create", "add_section"} and (type(expected) is not int or expected < 1):
        fail(ERROR.INVALID_ARGUMENT, "expectedRevision must be a positive integer.")
    if action == "create":
        entity_type = data.get("entityType")
        if entity_type not in ENTITY_TYPES:
            fail(ERROR.INVALID_ARGUMENT, "entityType must be friend or project.")
        name = string(data.get("name"), "name", 120).strip()
        alias_list = aliases(data.get("aliases", []))
        initial = string(data.get("content", ""), "content", 10000, True)
    elif action in {"add_section", "update_section"}:
        content = string(data.get("content"), "content", 10000)
    elif action == "rename":
        name = string(data.get("name"), "name", 120).strip()
    elif action == "update_aliases":
        alias_list = aliases(data.get("aliases"))
    elif action == "set_section_pinned" and type(data.get("pinned")) is not bool:
        fail(ERROR.INVALID_ARGUMENT, "pinned must be Boolean.")
    elif action == "set_section_unread" and type(data.get("unread")) is not bool:
        fail(ERROR.INVALID_ARGUMENT, "unread must be Boolean.")

    request_hash = hashlib.sha256(json.dumps({"action": action, "data": data}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    tx = db.transaction()

    @firestore.transactional
    def commit(transaction):
        previous = operation_ref.get(transaction=transaction)
        if previous.exists:
            saved = previous.to_dict()
            if saved["requestHash"] != request_hash:
                fail(ERROR.ALREADY_EXISTS, "This operation ID was used for a different request.")
            return {**saved["result"], "alreadyProcessed": True}

        current = None if action == "create" else entity_ref.get(transaction=transaction)
        if action != "create" and (not current.exists or current.to_dict().get("deleted", False)):
            fail(ERROR.NOT_FOUND, "Document not found or already deleted.")
        now = datetime.now(timezone.utc)

        if action == "create":
            has_section = bool(initial.strip())
            unread = entity_type == "friend" and has_section
            entity = {"entityType": entity_type, "name": name, "normalizedName": name.casefold(),
                      "aliases": alias_list, "revision": 1, "deleted": False,
                      "unreadCount": 1 if unread else 0, "sectionCount": 1 if has_section else 0,
                      "latestSectionAt": now if has_section else None, "createdAt": now, "updatedAt": now}
            transaction.create(entity_ref, entity)
            if has_section:
                transaction.create(section_ref, {"content": initial, "pinned": False, "unread": unread,
                                                  "revision": 1, "createdAt": now, "updatedAt": now})
            result = {"id": entity_ref.id, "sectionId": section_ref.id if has_section else None,
                      "revision": 1, "changed": True}
        else:
            entity = current.to_dict()
            entity.setdefault("unreadCount", 0)
            entity.setdefault("sectionCount", 0)
            entity_revision = entity.get("revision", 1)
            if action in {"rename", "update_aliases", "delete"} and entity_revision != expected:
                fail(ERROR.ABORTED, "This note changed elsewhere. Reload it before saving.")
            changed = True
            result_section = None
            if action == "add_section":
                unread = entity["entityType"] == "friend"
                transaction.create(section_ref, {"content": content, "pinned": False, "unread": unread,
                                                  "revision": 1, "createdAt": now, "updatedAt": now})
                entity["sectionCount"] += 1
                entity["unreadCount"] += 1 if unread else 0
                entity["latestSectionAt"] = now
                entity["updatedAt"] = now
                entity["revision"] = entity_revision + 1
                result_section = section_ref.id
            elif action in {"update_section", "set_section_pinned", "set_section_unread"}:
                section = section_ref.get(transaction=transaction)
                if not section.exists:
                    fail(ERROR.NOT_FOUND, "Section not found.")
                prior = section.to_dict()
                if prior["revision"] != expected:
                    fail(ERROR.ABORTED, "This section changed elsewhere. Reload it before saving.")
                updated = dict(prior)
                if action == "update_section":
                    updated["content"] = content
                elif action == "set_section_pinned":
                    updated["pinned"] = data["pinned"]
                else:
                    updated["unread"] = data["unread"]
                    entity["unreadCount"] = max(0, entity["unreadCount"] + (1 if data["unread"] else -1))
                changed = updated != prior
                if changed:
                    updated["revision"] = prior["revision"] + 1
                    updated["updatedAt"] = now
                    transaction.set(section_ref, updated)
                    if action == "update_section":
                        entity["updatedAt"] = now
                    entity["revision"] = entity_revision + 1
                result_section = section_ref.id
            elif action == "rename":
                changed = entity["name"] != name
                entity.update({"name": name, "normalizedName": name.casefold()})
            elif action == "update_aliases":
                changed = entity.get("aliases", []) != alias_list
                entity["aliases"] = alias_list
            else:
                changed = not entity.get("deleted", False)
                entity["deleted"] = True
            if action in {"rename", "update_aliases", "delete"} and changed:
                entity["revision"] = entity_revision + 1
                entity["updatedAt"] = now
            if changed:
                transaction.set(entity_ref, entity)
            result = {"id": entity_ref.id, "sectionId": result_section,
                      "revision": entity.get("revision", entity_revision), "changed": changed}

        transaction.create(operation_ref, {"requestHash": request_hash, "result": result, "createdAt": now})
        return result

    return commit(tx)


def _active_docs(docs, entity_type=None):
    query = docs if entity_type is None else docs.where(filter=FieldFilter("entityType", "==", entity_type))
    return [snap for snap in query.stream() if not snap.to_dict().get("deleted", False)]


def _migrate_legacy_section(db, snapshot):
    """Turn the former content field into one ordinary section on first access."""
    legacy = snapshot.to_dict().get("content", "")
    if not legacy:
        return
    section_ref = snapshot.reference.collection("sections").document("legacy-section")
    tx = db.transaction()

    @firestore.transactional
    def commit(transaction):
        current = snapshot.reference.get(transaction=transaction)
        section = section_ref.get(transaction=transaction)
        value = current.to_dict().get("content", "")
        if not value or section.exists:
            return
        entity = current.to_dict()
        unread = entity["entityType"] == "friend"
        created = entity.get("createdAt", entity["updatedAt"])
        transaction.create(section_ref, {"content": value, "pinned": False, "unread": unread,
                                         "revision": 1, "createdAt": created,
                                         "updatedAt": entity["updatedAt"]})
        transaction.update(snapshot.reference, {"content": firestore.DELETE_FIELD,
                           "sectionCount": 1, "unreadCount": 1 if unread else 0,
                           "latestSectionAt": entity["updatedAt"]})
    commit(tx)


def run_read(db, uid, action, data):
    docs = db.collection("users").document(uid).collection("docs")
    if action == "summary":
        friends = _active_docs(docs, "friend")
        return {"unreadFriends": sum(public_entity(item)["unreadCount"] for item in friends)}
    if action == "list":
        entity_type = data.get("entityType")
        if entity_type not in ENTITY_TYPES:
            fail(ERROR.INVALID_ARGUMENT, "entityType must be friend or project.")
        records = [public_entity(item) for item in _active_docs(docs, entity_type)]
        if entity_type == "friend":
            records.sort(key=lambda item: (item["unreadCount"] > 0, item.get("latestSectionAt") or item["updatedAt"]), reverse=True)
        else:
            records.sort(key=lambda item: item.get("latestSectionAt") or item["updatedAt"], reverse=True)
        return {"entities": records}
    if action == "recent_project_sections":
        limit = data.get("limit", 15)
        if type(limit) is not int or not 1 <= limit <= 100:
            fail(ERROR.INVALID_ARGUMENT, "limit must be between 1 and 100.")
        sections = []
        for snapshot in _active_docs(docs, "project"):
            _migrate_legacy_section(db, snapshot)
            snapshot = snapshot.reference.get()
            entity = public_entity(snapshot)
            sections.extend(public_section(item, entity) for item in snapshot.reference.collection("sections").stream())
        sections.sort(key=lambda item: item["createdAt"], reverse=True)
        return {"sections": sections[:limit]}

    entity_id = _entity_id(data)
    snapshot = docs.document(entity_id).get()
    if not snapshot.exists or snapshot.to_dict().get("deleted", False):
        fail(ERROR.NOT_FOUND, "Document not found.")
    if action == "get":
        return {"entity": public_entity(snapshot)}
    if action == "list_sections":
        _migrate_legacy_section(db, snapshot)
        snapshot = docs.document(entity_id).get()
        entity = public_entity(snapshot)
        sections = [public_section(item, entity) for item in snapshot.reference.collection("sections").stream()]
        sections.sort(key=lambda item: item["createdAt"], reverse=True)
        return {"sections": sections}
    fail(ERROR.INVALID_ARGUMENT, "Unknown Docs action.")


def handle(db, uid, data):
    if not uid:
        fail(ERROR.UNAUTHENTICATED, "Sign in to use Docs.")
    if not isinstance(data, dict):
        fail(ERROR.INVALID_ARGUMENT, "Request must be an object.")
    action = data.get("action")
    if action in {"create", "add_section", "update_section", "set_section_pinned",
                  "set_section_unread", "rename", "update_aliases", "delete"}:
        return run_mutation(db, uid, action, data)
    return run_read(db, uid, action, data)
