"""Deterministic, verifiable line deltas for Docs history."""

import difflib
import hashlib
import json


class HistoryError(ValueError):
    pass


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def make_patch(before: str, after: str) -> str:
    old = before.splitlines(keepends=True)
    new = after.splitlines(keepends=True)
    changes = []
    for tag, start, end, new_start, new_end in difflib.SequenceMatcher(
        None, old, new, autojunk=False
    ).get_opcodes():
        if tag != "equal":
            changes.append({"start": start, "remove": old[start:end], "add": new[new_start:new_end]})
    return json.dumps({"format": "line-delta-v1", "changes": changes}, ensure_ascii=False, separators=(",", ":"))


def apply_patch(before: str, patch: str) -> str:
    try:
        value = json.loads(patch)
        if value["format"] != "line-delta-v1" or not isinstance(value["changes"], list):
            raise HistoryError("Unsupported patch format")
        lines = before.splitlines(keepends=True)
        result = []
        cursor = 0
        for change in value["changes"]:
            start, removed, added = change["start"], change["remove"], change["add"]
            if (
                type(start) is not int or start < cursor or start > len(lines)
                or not isinstance(removed, list) or not isinstance(added, list)
                or any(not isinstance(line, str) for line in removed + added)
                or lines[start:start + len(removed)] != removed
            ):
                raise HistoryError("Patch does not match preceding revision")
            result.extend(lines[cursor:start])
            result.extend(added)
            cursor = start + len(removed)
        result.extend(lines[cursor:])
        return "".join(result)
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise HistoryError("Malformed patch") from exc


def verify_patch(before: str, patch: str, before_hash: str, after_hash: str) -> str:
    if content_hash(before) != before_hash:
        raise HistoryError("Before hash mismatch")
    after = apply_patch(before, patch)
    if content_hash(after) != after_hash:
        raise HistoryError("After hash mismatch")
    return after


def reconstruct_history(events: list[dict]) -> list[str]:
    versions = [""]
    for expected, event in enumerate(sorted(events, key=lambda item: item["newRevision"]), 1):
        if event["baseRevision"] != expected - 1 or event["newRevision"] != expected:
            raise HistoryError(f"Missing or out-of-order revision {expected}")
        versions.append(verify_patch(versions[-1], event["patch"], event["beforeHash"], event["afterHash"]))
    return versions


def format_deltas(events: list[dict]) -> str:
    reconstruct_history(events)
    output = []
    for event in sorted(events, key=lambda item: item["newRevision"]):
        patch = json.loads(event["patch"])
        output.append(f"Revision {event['newRevision']} ({event['operation']}, {event['source']}):")
        for change in patch["changes"]:
            output.extend("-" + line.rstrip("\r\n") for line in change["remove"])
            output.extend("+" + line.rstrip("\r\n") for line in change["add"])
    return "\n".join(output)
