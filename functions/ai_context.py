"""Owner-scoped entity and current-section retrieval."""
import json, os, re
from dataclasses import dataclass
from docs_service import _migrate_legacy_section, public_entity, public_section

class ContextFailure(Exception):
    def __init__(self, code, message):
        super().__init__(message); self.code = code

@dataclass
class RetrievedContext:
    candidates: list[dict]
    sections: dict[str, list[dict]]
    context_text: str

def _matches(message, record):
    folded = message.casefold()
    scores = []
    for name in [record["name"], *record.get("aliases", [])]:
        normalized = name.casefold().strip()
        if normalized and re.search(r"(?<!\w)" + re.escape(normalized) + r"(?!\w)", folded):
            scores.append((100, len(normalized)))
        elif len(normalized) >= 4 and any(len(word) >= 4 and re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)", folded) for word in normalized.split()):
            scores.append((20, len(normalized)))
    return max(scores, default=(0, 0))

class ContextRetriever:
    def __init__(self, db, uid):
        self.db = db
        self.docs = db.collection("users").document(uid).collection("docs")
        try: self.max_context_chars = int(os.environ.get("AI_MAX_CONTEXT_CHARS", "45000"))
        except ValueError as exc: raise ContextFailure("failed-precondition", "AI context budget is misconfigured") from exc

    def retrieve(self, message, allowed_ids=None):
        snapshots = list(self.docs.limit(201).stream())
        if len(snapshots) > 200: raise ContextFailure("resource-exhausted", "Too many Docs records for the current lookup")
        active = [(snap, public_entity(snap)) for snap in snapshots if not snap.to_dict().get("deleted", False)]
        possible = [(snap, item) for snap, item in active if allowed_ids is None or item["id"] in allowed_ids]
        scored = [(snap, item, _matches(message, item)) for snap, item in possible]
        matched = [(snap, item) for snap, item, score in scored if score[0] > 0]
        if allowed_ids and not matched and len(possible) == 1: matched = possible
        matched.sort(key=lambda pair: (_matches(message, pair[1]), pair[1]["normalizedName"]), reverse=True)
        if len(matched) > 8: raise ContextFailure("ambiguous", "Too many matching notes; use a fuller name")
        section_map, payload = {}, []
        for snap, item in matched:
            _migrate_legacy_section(self.db, snap)
            snap = self.docs.document(item["id"]).get()
            item = public_entity(snap)
            sections = [public_section(section, item) for section in snap.reference.collection("sections").stream()]
            section_map[item["id"]] = sections
            payload.append({"entityId":item["id"],"entityType":item["entityType"],"name":item["name"],"aliases":item["aliases"],"revision":item["revision"],"sections":[{"sectionId":s["id"],"content":s["content"],"createdAt":s["createdAt"]} for s in sections]})
        text = json.dumps({"retrievedCandidates": payload}, ensure_ascii=False)
        if len(text) > self.max_context_chars: raise ContextFailure("resource-exhausted", "Relevant sections exceed the configured context budget")
        return RetrievedContext([item for _, item in matched], section_map, text)
