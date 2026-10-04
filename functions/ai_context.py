"""Bounded, owner-scoped candidate and historical-delta retrieval."""

import json
import os
import re
from dataclasses import dataclass

from docs_delta import HistoryError, reconstruct_history
from docs_service import public_record


class ContextFailure(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class RetrievedContext:
    candidates: list[dict]
    active_records: list[dict]
    histories: dict[str, list[dict]]
    context_text: str


def _matches(message: str, record: dict) -> tuple[int, int]:
    folded = message.casefold()
    names = [record["name"], *record.get("aliases", [])]
    scores = []
    for name in names:
        normalized = name.casefold().strip()
        if not normalized:
            continue
        if re.search(r"(?<!\w)" + re.escape(normalized) + r"(?!\w)", folded):
            scores.append((100, len(normalized)))
        elif len(normalized) >= 4 and any(
            len(word) >= 4 and re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)", folded)
            for word in normalized.split()
        ):
            scores.append((20, len(normalized)))
    return max(scores, default=(0, 0))


def format_history(events: list[dict]) -> str:
    lines = []
    for event in sorted(events, key=lambda item: item["newRevision"]):
        lines.append(f"Revision {event['baseRevision']} -> {event['newRevision']}")
        lines.append(f"Event ID: {event['eventId']}; Timestamp: {event['timestamp']}; Operation: {event['operation']}; Source: {event['source']}; Change type: {event['changeType']}")
        for change in json.loads(event["patch"])["changes"]:
            lines.extend("- " + line.rstrip("\r\n") for line in change["remove"])
            lines.extend("+ " + line.rstrip("\r\n") for line in change["add"])
    return "\n".join(lines)


class ContextRetriever:
    def __init__(self, db, uid: str):
        self.db = db
        self.uid = uid
        self.docs = db.collection("users").document(uid).collection("docs")
        try:
            self.max_context_chars = int(os.environ.get("AI_MAX_CONTEXT_CHARS", "45000"))
        except ValueError as exc:
            raise ContextFailure("failed-precondition", "AI context budget is misconfigured") from exc
        if not 1 <= self.max_context_chars <= 500000:
            raise ContextFailure("failed-precondition", "AI context budget must be 1–500,000 characters")

    def retrieve(self, message: str, include_full_history: bool, allowed_ids: list[str] | None = None) -> RetrievedContext:
        # One bounded owner collection scan keeps retrieval independent of the model.
        snapshots = list(self.docs.limit(201).stream())
        if len(snapshots) > 200:
            raise ContextFailure("resource-exhausted", "Too many Docs records for the current lookup")
        active = [public_record(item) for item in snapshots if not item.to_dict()["deleted"]]
        possible = [item for item in active if allowed_ids is None or item["id"] in allowed_ids]
        scores = {item["id"]: _matches(message, item) for item in possible}
        matched = [item for item in possible if scores[item["id"]][0] > 0]
        matched.sort(key=lambda item: (scores[item["id"]], item["normalizedName"]), reverse=True)
        if allowed_ids and not matched and len(possible) == 1:
            matched = possible
        if len(matched) > 8:
            raise ContextFailure("ambiguous", "Too many matching documents; please use a fuller name")
        histories = {}
        payload = []
        for item in matched:
            entry = {"entityId": item["id"], "entityType": item["entityType"], "name": item["name"],
                     "aliases": item["aliases"], "revision": item["revision"],
                     "currentDocument": item["content"]}
            if include_full_history:
                edits = [public_record(edit) for edit in self.docs.document(item["id"]).collection("edits").stream()]
                try:
                    versions = reconstruct_history(edits)
                except HistoryError as exc:
                    raise ContextFailure("data-loss", "A document's history is incomplete or corrupt") from exc
                if len(edits) != item["revision"] or versions[-1] != item["content"]:
                    raise ContextFailure("data-loss", "A document does not match its edit history")
                edits.sort(key=lambda event: event["newRevision"])
                histories[item["id"]] = edits
                entry["historicalDeltas"] = format_history(edits)
            payload.append(entry)
        context_text = json.dumps({"mode": "full_history" if include_full_history else "current_only",
                                   "retrievedCandidates": payload}, ensure_ascii=False)
        if len(context_text) > self.max_context_chars:
            raise ContextFailure("resource-exhausted", "Relevant context exceeds the configured budget; no history was truncated")
        return RetrievedContext(matched, active, histories, context_text)
