"""Owner-scoped interpretation, persisted proposals, and atomic approvals."""

import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from google.api_core.exceptions import Aborted, AlreadyExists, Conflict
from google.cloud import firestore
from pydantic import ValidationError

from ai_context import ContextFailure, ContextRetriever
from ai_prompt import PROMPT_VERSION, SYSTEM_PROMPT
from ai_provider import ProviderFailure
from ai_schema import (AddAction, ClarifyAction, CreateAction, DeleteAction,
                       ModifyAction, QueryAction, parse_action)
from docs_delta import content_hash, make_patch
from docs_service import ID_PATTERN


class EngineFailure(Exception):
    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.details = details


def _validation_reason(exc: ValidationError | ValueError) -> str:
    if isinstance(exc, ValidationError):
        issues = []
        for item in exc.errors(include_input=False, include_url=False)[:3]:
            path = ".".join(str(part) for part in item["loc"])
            issues.append(f"{path}: {item['msg']}" if path else item["msg"])
        return "Model response did not match the required action format: " + "; ".join(issues)
    return f"Model response could not be parsed: {exc}"


def _id(value, label):
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise EngineFailure("invalid-argument", f"A valid {label} is required")
    return value


def _utcnow():
    return datetime.now(timezone.utc)


def _question(message: str) -> bool:
    return bool("?" in message or re.match(r"(?i)^\s*(who|what|where|when|why|how|does|did|is|was|were|do)\b", message))


def _historical_question(message: str) -> bool:
    return bool(re.search(r"(?i)\b(previous|previously|formerly|before|used to|historical|past)\b", message))


def _candidate_choice(record: dict) -> dict:
    return {"entityId": record["id"], "entityType": record["entityType"], "name": record["name"]}


def _unique_span(content: str, span: str) -> bool:
    return bool(span) and content.count(span) == 1


def _apply(action, before: str, replacement: str | None = None) -> str:
    if isinstance(action, AddAction):
        new = action.newText if replacement is None else replacement
        if not new or len(new) > 10000:
            raise EngineFailure("invalid-argument", "Added text must be 1–10,000 characters")
        if action.afterText is None:
            return before + ("\n" if before and not before.endswith("\n") else "") + new
        if not _unique_span(before, action.afterText):
            raise EngineFailure("failed-precondition", "Insertion anchor is missing or ambiguous")
        end = before.index(action.afterText) + len(action.afterText)
        prefix, suffix = before[:end], before[end:]
        insertion = ("\n" if prefix and not prefix.endswith("\n") else "") + new
        if suffix and not insertion.endswith("\n"):
            insertion += "\n"
        return prefix + insertion + suffix
    if isinstance(action, (ModifyAction, DeleteAction)) and action.scope == "content":
        old = action.oldText
        if not _unique_span(before, old):
            raise EngineFailure("failed-precondition", "Original text is missing or ambiguous")
        if isinstance(action, ModifyAction) and old == before and len(before.splitlines()) > 1:
            raise EngineFailure("failed-precondition", "A whole-document replacement is too broad; propose a smaller exact span")
        new = (action.newText if isinstance(action, ModifyAction) else "") if replacement is None else replacement
        if len(new) > 10000:
            raise EngineFailure("invalid-argument", "Replacement text is too long")
        return before.replace(old, new, 1)
    raise EngineFailure("invalid-argument", "Unsupported content operation")


class ActionEngine:
    def __init__(self, db, uid: str, provider):
        if not uid:
            raise EngineFailure("unauthenticated", "Sign in to use Docs AI")
        self.db = db
        self.uid = uid
        self.provider = provider
        self.user = db.collection("users").document(uid)
        self.docs = self.user.collection("docs")

    def _start_request(self, request_id: str, fingerprint: str):
        reference = self.user.collection("aiRequests").document(request_id)
        try:
            reference.create({"requestHash": fingerprint, "status": "processing", "createdAt": _utcnow()})
            return reference, None
        except (AlreadyExists, Conflict):
            previous = reference.get().to_dict()
            if previous["requestHash"] != fingerprint:
                raise EngineFailure("already-exists", "This request ID was used for a different message")
            if previous["status"] == "completed":
                return reference, previous["response"]
            if previous["status"] == "failed":
                raise EngineFailure(previous["errorCode"], previous["errorMessage"], previous.get("errorDetails"))
            raise EngineFailure("unavailable", "This request is still processing; check its request ID before resending")

    def _finish(self, request_ref, response: dict, conversation: dict | None = None):
        stored_proposal = response.pop("_storedProposal", None)
        transaction = self.db.transaction()
        @firestore.transactional
        def commit(tx):
            if stored_proposal is not None:
                tx.create(self.user.collection("aiProposals").document(response["proposalId"]), stored_proposal)
            if conversation is not None:
                tx.set(self.user.collection("aiConversations").document(response["conversationId"]), conversation)
            tx.update(request_ref, {"status": "completed", "response": response, "completedAt": _utcnow()})
        commit(transaction)
        return response

    def _conversation(self, conversation_id: str | None):
        if not conversation_id:
            return None
        snapshot = self.user.collection("aiConversations").document(conversation_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict()
        return data if data["expiresAt"] > _utcnow() else None

    def interpret(self, request: dict):
        if not isinstance(request, dict):
            raise EngineFailure("invalid-argument", "Request must be an object")
        message = request.get("message")
        if not isinstance(message, str) or not message.strip() or len(message) > 4000:
            raise EngineFailure("invalid-argument", "Message must contain 1–4,000 characters")
        if type(request.get("includeFullHistory", False)) is not bool:
            raise EngineFailure("invalid-argument", "includeFullHistory must be Boolean")
        include_full_history = request.get("includeFullHistory", False)
        request_id = _id(request.get("requestId"), "requestId")
        conversation_id = request.get("conversationId")
        if conversation_id is not None:
            _id(conversation_id, "conversationId")
        selected_id = request.get("selectedEntityId")
        if selected_id is not None:
            _id(selected_id, "selectedEntityId")
            if conversation_id is None:
                raise EngineFailure("invalid-argument", "A selected entity requires a clarification conversation")
        fingerprint = hashlib.sha256(json.dumps({"message": message, "full": include_full_history,
                                                 "conversationId": conversation_id, "selectedEntityId": selected_id}, sort_keys=True).encode()).hexdigest()
        request_ref, saved = self._start_request(request_id, fingerprint)
        if saved is not None:
            return saved
        diagnostics: dict[str, str] = {}
        try:
            response, conversation = self._interpret_new(message, include_full_history, conversation_id, request_id, selected_id, diagnostics)
            return self._finish(request_ref, response, conversation)
        except (EngineFailure, ContextFailure, ProviderFailure) as exc:
            code = exc.code if isinstance(exc, (EngineFailure, ContextFailure)) else {
                "configuration": "failed-precondition", "timeout": "deadline-exceeded",
                "rate_limit": "resource-exhausted"}.get(exc.code, "unavailable")
            details = {"reason": str(exc), "requestId": request_id, **diagnostics}
            if isinstance(exc, ProviderFailure) and exc.raw_response is not None:
                details["rawResponse"] = exc.raw_response
            if isinstance(exc, EngineFailure) and exc.details:
                details.update(exc.details)
            request_ref.update({"status": "failed", "errorCode": code, "errorMessage": str(exc),
                                "errorDetails": details, "completedAt": _utcnow()})
            raise EngineFailure(code, str(exc), details) from exc
        except (ValidationError, ValueError) as exc:
            reason = _validation_reason(exc)
            details = {"reason": reason, "requestId": request_id, **diagnostics}
            request_ref.update({"status": "failed", "errorCode": "failed-precondition",
                                "errorMessage": reason, "errorDetails": details, "completedAt": _utcnow()})
            raise EngineFailure("failed-precondition", reason, details) from exc
        except Aborted as exc:
            raise EngineFailure("aborted", "A concurrent edit changed this request; try again") from exc

    def _interpret_new(self, message: str, include_full_history: bool, conversation_id: str | None, request_id: str, selected_id: str | None, diagnostics: dict[str, str]):
        prior = self._conversation(conversation_id)
        if selected_id and (not prior or selected_id not in prior["candidateIds"]):
            raise EngineFailure("permission-denied", "Selected document was not a clarification choice")
        original = prior["originalMessage"] if prior else message
        allowed_ids = [selected_id] if selected_id else (prior["candidateIds"] if prior else None)
        context = ContextRetriever(self.db, self.uid).retrieve(message, include_full_history, allowed_ids)
        candidates = context.candidates
        if len(candidates) > 1:
            first_score = _name_score(message, candidates[0])
            second_score = _name_score(message, candidates[1])
            if first_score[0] < 100 or first_score == second_score:
                return self._clarify("Which document do you mean?", candidates, conversation_id, original)
            candidates = candidates[:1]
            context = ContextRetriever(self.db, self.uid).retrieve(message, include_full_history, [candidates[0]["id"]])
        if _question(original) and not candidates:
            return ({"kind": "query", "action": "query", "answer": "I don't have that information in Docs.",
                     "references": [], "requestId": request_id}, None)
        if _question(original) and candidates and not include_full_history and _historical_question(original):
            if not any(re.search(r"(?i)\b(previously|formerly|before|used to)\b", item["content"]) for item in candidates):
                return ({"kind": "query", "action": "query", "answer": "That history is unavailable from the current documents. Enable full history to check earlier edits.",
                         "references": [_reference(item) for item in candidates], "requestId": request_id}, None)
        if _question(original) and candidates and re.search(r"(?i)\bbirthday\b", original):
            if not any(re.search(r"(?i)\bbirthday\b", item["content"]) for item in candidates):
                return ({"kind": "query", "action": "query", "answer": "The birthday is not recorded in the available document.",
                         "references": [_reference(item) for item in candidates], "requestId": request_id}, None)
        conversation_text = (f"Original user message: {original}\nClarification: {message}"
                             + (f"\nSelected entity ID: {selected_id}" if selected_id else "")) if prior else message
        prompt_data = {"userMessage": conversation_text, "includeFullHistory": include_full_history,
                       "context": json.loads(context.context_text)}
        reply = self.provider.complete([{"role": "system", "content": SYSTEM_PROMPT},
                                        {"role": "user", "content": json.dumps(prompt_data, ensure_ascii=False)}], request_id)
        diagnostics["rawResponse"] = reply.content
        if reply.response_id:
            diagnostics["modelResponseId"] = reply.response_id
        action = parse_action(reply.content)
        allow_duplicate = bool(prior and re.search(r"(?i)\b(create another|new one|another copy)\b", message))
        if isinstance(action, CreateAction) and not allow_duplicate:
            normalized = action.name.casefold().strip()
            duplicates = [item for item in context.active_records if item["entityType"] == action.entityType and
                          (normalized == item["normalizedName"] or normalized in [alias.casefold() for alias in item.get("aliases", [])])]
            if duplicates:
                return self._clarify(f"A {action.entityType} named {action.name} already exists. Use an existing document or create another?",
                                     duplicates, conversation_id, original)
        self._validate(action, message, original, context, include_full_history, allow_duplicate)
        usage = {"promptTokens": reply.prompt_tokens, "completionTokens": reply.completion_tokens,
                 "latencyMs": reply.latency_ms, "modelResponseId": reply.response_id,
                 "promptVersion": PROMPT_VERSION}
        if isinstance(action, QueryAction):
            return ({"kind": "query", "action": "query", "answer": action.answer,
                     "references": [item.model_dump() for item in action.references], "requestId": request_id,
                     "usage": usage}, None)
        if isinstance(action, ClarifyAction):
            return self._clarify(action.question, candidates, conversation_id, original, action.choices, usage)
        proposal_ref = self.user.collection("aiProposals").document()
        proposal = action.model_dump()
        if isinstance(action, CreateAction):
            target_id = self.docs.document().id
            before = ""
            after = action.content
        elif isinstance(action, DeleteAction) and action.scope == "entity":
            before = candidates[0]["content"]
            after = before
        else:
            target = next(item for item in candidates if item["id"] == action.entityId)
            before = target["content"]
            after = _apply(action, before)
        if len(after) > 200000 or (not isinstance(action, CreateAction) and before == after and not (isinstance(action, DeleteAction) and action.scope == "entity")):
            raise EngineFailure("failed-precondition", "Proposal has no safe, meaningful change")
        expires = _utcnow() + timedelta(hours=24)
        stored = {"requestId": request_id, "ownerUid": self.uid, "action": proposal,
                  "expectedRevision": None if isinstance(action, CreateAction) else action.expectedRevision,
                  "entityId": target_id if isinstance(action, CreateAction) else action.entityId,
                  "beforeHash": content_hash(before), "createdAt": _utcnow(), "expiresAt": expires,
                  "status": "pending", "promptVersion": PROMPT_VERSION}
        response = {"kind": "proposal", "action": action.action, "proposalId": proposal_ref.id,
                    "requestId": request_id, "expiresAt": expires.isoformat(), "proposal": proposal,
                    "targetName": action.name if isinstance(action, CreateAction) else next(item["name"] for item in candidates if item["id"] == action.entityId),
                    "preview": {"before": before, "after": after}, "usage": usage,
                    "_storedProposal": stored}
        return response, None

    def _clarify(self, question, candidates, conversation_id, original, choices=None, usage=None):
        chosen = [item.model_dump() for item in choices] if choices else [_candidate_choice(item) for item in candidates]
        ident = conversation_id or str(uuid.uuid4())
        response = {"kind": "clarify", "action": "clarify", "question": question,
                    "choices": chosen, "conversationId": ident}
        if usage:
            response["usage"] = usage
        state = {"originalMessage": original, "candidateIds": [item["id"] for item in candidates],
                 "expiresAt": _utcnow() + timedelta(hours=24)}
        return response, state

    def _validate(self, action, message, original, context, full_history, allow_duplicate=False):
        candidates = {item["id"]: item for item in context.candidates}
        if _question(original) and isinstance(action, (AddAction, ModifyAction, DeleteAction)):
            raise EngineFailure("failed-precondition", "A question cannot change a document")
        if isinstance(action, CreateAction):
            normalized = action.name.casefold().strip()
            duplicates = [item for item in context.active_records if item["entityType"] == action.entityType and
                          (normalized == item["normalizedName"] or normalized in [alias.casefold() for alias in item.get("aliases", [])])]
            if duplicates and not allow_duplicate:
                raise EngineFailure("failed-precondition", "A possible duplicate exists; choose an existing document or clarify first")
            if _question(original):
                raise EngineFailure("failed-precondition", "A question cannot implicitly create a document")
            if not action.name.strip():
                raise EngineFailure("failed-precondition", "A name is required")
        elif isinstance(action, (AddAction, ModifyAction, DeleteAction)):
            target = candidates.get(action.entityId)
            if not target or target["entityType"] != action.entityType:
                raise EngineFailure("permission-denied", "Proposed target was not in the retrieved owner context")
            if action.expectedRevision != target["revision"]:
                raise EngineFailure("aborted", "Model used a stale document revision")
            if isinstance(action, DeleteAction) and action.scope == "entity":
                if not re.search(r"(?i)\b(delete|remove|erase)\b", original) or not re.search(r"(?i)\b(record|document|entity|friend|project|person)\b|^\s*delete\s+\w+", original):
                    raise EngineFailure("failed-precondition", "Whole-document deletion was not explicitly requested")
            else:
                _apply(action, target["content"])
        elif isinstance(action, QueryAction):
            for reference in action.references:
                target = candidates.get(reference.entityId)
                if not target or target["revision"] != reference.revision:
                    raise EngineFailure("failed-precondition", "Query cited an unavailable document")
                known_events = {event["eventId"] for event in context.histories.get(reference.entityId, [])}
                if not set(reference.eventIds) <= known_events:
                    raise EngineFailure("failed-precondition", "Query cited unavailable history")
                if reference.eventIds and not full_history:
                    raise EngineFailure("failed-precondition", "Current-only query cannot cite history")
            if candidates and not action.references:
                raise EngineFailure("failed-precondition", "Query must cite the retrieved document")
        elif isinstance(action, ClarifyAction):
            for choice in action.choices:
                target = candidates.get(choice.entityId)
                if not target or target["name"] != choice.name or target["entityType"] != choice.entityType:
                    raise EngineFailure("failed-precondition", "Clarification included an unavailable choice")

    def approve(self, request: dict):
        if not isinstance(request, dict):
            raise EngineFailure("invalid-argument", "Request must be an object")
        proposal_id = _id(request.get("proposalId"), "proposalId")
        approval_id = _id(request.get("approvalRequestId"), "approvalRequestId")
        replacement = request.get("replacementText")
        if replacement is not None and (not isinstance(replacement, str) or len(replacement) > 10000):
            raise EngineFailure("invalid-argument", "Replacement text is invalid or too long")
        edited_name = request.get("entityName")
        if edited_name is not None and (not isinstance(edited_name, str) or not edited_name.strip() or len(edited_name) > 120):
            raise EngineFailure("invalid-argument", "Entity name must contain 1–120 characters")
        proposal_ref = self.user.collection("aiProposals").document(proposal_id)
        approval_ref = self.user.collection("aiApprovals").document(approval_id)
        tx = self.db.transaction()

        @firestore.transactional
        def commit(transaction):
            previous = approval_ref.get(transaction=transaction)
            if previous.exists:
                data = previous.to_dict()
                if (data["proposalId"] != proposal_id or data.get("replacementText") != replacement
                        or data.get("entityName") != edited_name):
                    raise EngineFailure("already-exists", "Approval request ID was reused for a different approval")
                return {**data["result"], "alreadyProcessed": True}
            snapshot = proposal_ref.get(transaction=transaction)
            if not snapshot.exists:
                raise EngineFailure("not-found", "Proposal not found for this account")
            proposal = snapshot.to_dict()
            if proposal["status"] != "pending":
                raise EngineFailure("failed-precondition", "Proposal is no longer pending")
            if proposal["expiresAt"] <= _utcnow():
                transaction.update(proposal_ref, {"status": "expired"})
                return {"expired": True}
            action = parse_action(json.dumps(proposal["action"]))
            if edited_name is not None and not isinstance(action, CreateAction):
                raise EngineFailure("invalid-argument", "Only creation proposals can edit the entity name")
            entity_ref = self.docs.document(proposal["entityId"])
            current = None if isinstance(action, CreateAction) else entity_ref.get(transaction=transaction)
            if current is not None and (not current.exists or current.to_dict()["deleted"]):
                raise EngineFailure("not-found", "Target document was deleted")
            before = "" if current is None else current.to_dict()["content"]
            if content_hash(before) != proposal["beforeHash"]:
                raise EngineFailure("aborted", "Document content changed; proposal is stale")
            if current is not None and current.to_dict()["revision"] != proposal["expectedRevision"]:
                raise EngineFailure("aborted", "Document revision changed; proposal is stale")
            if isinstance(action, CreateAction):
                after = action.content if replacement is None else replacement
                if len(after) > 200000:
                    raise EngineFailure("invalid-argument", "Initial document is too long")
                now = _utcnow()
                name = (edited_name if edited_name is not None else action.name).strip()
                entity = {"entityType": action.entityType, "name": name,
                          "normalizedName": name.casefold(), "aliases": [],
                          "content": after, "revision": 1, "deleted": False,
                          "createdAt": now, "updatedAt": now}
                base_revision, new_revision = 0, 1
                transaction.create(entity_ref, entity)
            else:
                now = _utcnow()
                entity = dict(current.to_dict())
                base_revision = entity["revision"]
                new_revision = base_revision + 1
                if isinstance(action, DeleteAction) and replacement is not None:
                    raise EngineFailure("invalid-argument", "Deletion proposals cannot be converted into replacements")
                if isinstance(action, DeleteAction) and action.scope == "entity":
                    after = before
                    entity["deleted"] = True
                else:
                    after = _apply(action, before, replacement)
                    if after == before or len(after) > 200000:
                        raise EngineFailure("failed-precondition", "Edited proposal makes no safe change")
                    entity["content"] = after
                entity["revision"] = new_revision
                entity["updatedAt"] = now
                transaction.set(entity_ref, entity)
            event = {"eventId": approval_id, "operation": action.action,
                     "baseRevision": base_revision, "newRevision": new_revision,
                     "patch": make_patch(before, after), "beforeHash": content_hash(before),
                     "afterHash": content_hash(after), "source": "ai_approved",
                     "changeType": action.changeType, "description": action.reason,
                     "timestamp": now, "beforeName": "" if current is None else entity["name"],
                     "afterName": entity["name"], "beforeAliases": [] if current is None else entity["aliases"],
                     "afterAliases": entity["aliases"]}
            transaction.create(entity_ref.collection("edits").document(approval_id), event)
            result = {"entityId": entity_ref.id, "entityType": entity["entityType"],
                      "name": entity["name"], "revision": new_revision, "status": "approved"}
            transaction.update(proposal_ref, {"status": "approved", "approvedAt": now,
                                              "approvalRequestId": approval_id, "result": result})
            transaction.create(approval_ref, {"proposalId": proposal_id,
                                               "replacementText": replacement, "entityName": edited_name,
                                               "result": result, "createdAt": now})
            return result

        try:
            result = commit(tx)
        except Aborted as exc:
            raise EngineFailure("aborted", "A concurrent edit changed this proposal; reload before approving") from exc
        if result.get("expired"):
            raise EngineFailure("failed-precondition", "Proposal expired; ask again for a new proposal")
        return result

    def reject(self, request: dict):
        if not isinstance(request, dict):
            raise EngineFailure("invalid-argument", "Request must be an object")
        proposal_id = _id(request.get("proposalId"), "proposalId")
        proposal_ref = self.user.collection("aiProposals").document(proposal_id)
        tx = self.db.transaction()
        @firestore.transactional
        def commit(transaction):
            snapshot = proposal_ref.get(transaction=transaction)
            if not snapshot.exists:
                raise EngineFailure("not-found", "Proposal not found for this account")
            status = snapshot.to_dict()["status"]
            if status == "rejected":
                return {"status": "rejected", "alreadyProcessed": True}
            if status != "pending":
                raise EngineFailure("failed-precondition", "Proposal is no longer pending")
            if snapshot.to_dict()["expiresAt"] <= _utcnow():
                transaction.update(proposal_ref, {"status": "expired"})
                return {"expired": True}
            transaction.update(proposal_ref, {"status": "rejected", "rejectedAt": _utcnow()})
            return {"status": "rejected"}
        try:
            result = commit(tx)
        except Aborted as exc:
            raise EngineFailure("aborted", "A concurrent decision changed this proposal") from exc
        if result.get("expired"):
            raise EngineFailure("failed-precondition", "Proposal expired")
        return result


def _name_score(message: str, item: dict):
    folded = message.casefold()
    names = [item["name"], *item.get("aliases", [])]
    exact = [(100, len(name)) for name in names if re.search(r"(?<!\w)" + re.escape(name.casefold()) + r"(?!\w)", folded)]
    return max(exact, default=(20, 0))


def _reference(item: dict):
    return {"entityId": item["id"], "revision": item["revision"], "eventIds": []}
