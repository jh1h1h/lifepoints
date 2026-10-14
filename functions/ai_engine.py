"""DeepSeek routing/query flow with exact-text section approvals."""
import hashlib, json, uuid
from datetime import datetime, timedelta, timezone

from google.api_core.exceptions import Aborted, AlreadyExists, Conflict
from google.cloud import firestore
from pydantic import ValidationError

from ai_context import ContextFailure, ContextRetriever
from ai_prompt import PROMPT_VERSION, SYSTEM_PROMPT
from ai_provider import ProviderFailure
from ai_schema import AddAction, ClarifyAction, CreateAction, QueryAction, parse_action
from docs_service import ID_PATTERN

class EngineFailure(Exception):
    def __init__(self, code, message, details=None):
        super().__init__(message); self.code = code; self.details = details

def _utcnow(): return datetime.now(timezone.utc)

def _id(value, label):
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise EngineFailure("invalid-argument", f"A valid {label} is required")
    return value

def _choice(record):
    return {"entityId":record["id"],"entityType":record["entityType"],"name":record["name"]}

class ActionEngine:
    def __init__(self, db, uid, provider):
        if not uid: raise EngineFailure("unauthenticated", "Sign in to use Docs AI")
        self.db, self.uid, self.provider = db, uid, provider
        self.user = db.collection("users").document(uid)
        self.docs = self.user.collection("docs")

    def _start(self, request_id, fingerprint):
        ref = self.user.collection("aiRequests").document(request_id)
        try:
            ref.create({"requestHash":fingerprint,"status":"processing","createdAt":_utcnow()})
            return ref, None
        except (AlreadyExists, Conflict):
            prior = ref.get().to_dict()
            if prior["requestHash"] != fingerprint: raise EngineFailure("already-exists", "This request ID was used for a different message")
            if prior["status"] == "completed": return ref, prior["response"]
            if prior["status"] == "failed": raise EngineFailure(prior["errorCode"], prior["errorMessage"], prior.get("errorDetails"))
            raise EngineFailure("unavailable", "This request is still processing")

    def _finish(self, ref, response, conversation=None):
        stored = response.pop("_storedProposal", None)
        tx = self.db.transaction()
        @firestore.transactional
        def commit(transaction):
            if stored: transaction.create(self.user.collection("aiProposals").document(response["proposalId"]), stored)
            if conversation: transaction.set(self.user.collection("aiConversations").document(response["conversationId"]), conversation)
            transaction.update(ref, {"status":"completed","response":response,"completedAt":_utcnow()})
        commit(tx)
        return response

    def _conversation(self, ident):
        if not ident: return None
        snap = self.user.collection("aiConversations").document(ident).get()
        return snap.to_dict() if snap.exists and snap.to_dict()["expiresAt"] > _utcnow() else None

    def interpret(self, request):
        if not isinstance(request, dict): raise EngineFailure("invalid-argument", "Request must be an object")
        message = request.get("message")
        if not isinstance(message, str) or not message.strip() or len(message) > 4000:
            raise EngineFailure("invalid-argument", "Message must contain 1–4,000 characters")
        request_id = _id(request.get("requestId"), "requestId")
        conversation_id, selected_id = request.get("conversationId"), request.get("selectedEntityId")
        if conversation_id is not None: _id(conversation_id, "conversationId")
        if selected_id is not None: _id(selected_id, "selectedEntityId")
        fingerprint = hashlib.sha256(json.dumps({"message":message,"conversationId":conversation_id,"selectedEntityId":selected_id}, sort_keys=True).encode()).hexdigest()
        ref, saved = self._start(request_id, fingerprint)
        if saved is not None: return saved
        diagnostics = {"requestId":request_id}
        try:
            prior = self._conversation(conversation_id)
            if selected_id and (not prior or selected_id not in prior["candidateIds"]):
                raise EngineFailure("permission-denied", "Selected note was not a clarification choice")
            original = prior["originalMessage"] if prior else message
            allowed = [selected_id] if selected_id else (prior["candidateIds"] if prior else None)
            context = ContextRetriever(self.db, self.uid).retrieve(message, allowed)
            user_text = (f"Original statement (save exactly): {original}\nClarification response: {message}" + (f"\nSelected entity ID: {selected_id}" if selected_id else "")) if prior else message
            reply = self.provider.complete([{"role":"system","content":SYSTEM_PROMPT},{"role":"user","content":json.dumps({"userMessage":user_text,"context":json.loads(context.context_text)}, ensure_ascii=False)}], request_id)
            diagnostics.update({"rawResponse":reply.content,"modelResponseId":reply.response_id})
            action = parse_action(reply.content)
            candidates = {item["id"]:item for item in context.candidates}
            if isinstance(action, QueryAction):
                for reference in action.references:
                    known = {s["id"] for s in context.sections.get(reference.entityId, [])}
                    if reference.entityId not in candidates or not set(reference.sectionIds) <= known:
                        raise EngineFailure("failed-precondition", "Query cited an unavailable section")
                response = {"kind":"query","action":"query","answer":action.answer,"references":[r.model_dump() for r in action.references],"requestId":request_id}
                return self._finish(ref, response)
            if isinstance(action, ClarifyAction):
                for choice in action.choices:
                    target = candidates.get(choice.entityId)
                    if not target or target["name"] != choice.name or target["entityType"] != choice.entityType:
                        raise EngineFailure("failed-precondition", "Clarification included an unavailable choice")
                ident = conversation_id or str(uuid.uuid4())
                response = {"kind":"clarify","action":"clarify","question":action.question,"choices":[c.model_dump() for c in action.choices],"conversationId":ident}
                state = {"originalMessage":original,"candidateIds":list(candidates),"expiresAt":_utcnow()+timedelta(hours=24)}
                return self._finish(ref, response, state)
            if isinstance(action, AddAction):
                target = candidates.get(action.entityId)
                if not target or target["entityType"] != action.entityType: raise EngineFailure("permission-denied", "Proposed target was not in the retrieved context")
                if target["revision"] != action.expectedRevision: raise EngineFailure("aborted", "Model used a stale note revision")
                known_sections = {s["id"]:s for s in context.sections.get(action.entityId, [])}
                if not set(action.conflicts) <= set(known_sections): raise EngineFailure("failed-precondition", "Conflict check cited an unavailable section")
                entity_id, target_name = action.entityId, target["name"]
                conflicts = [known_sections[item] for item in action.conflicts]
                proposal = {**action.model_dump(), "text":original}
            else:
                if not isinstance(action, CreateAction): raise EngineFailure("failed-precondition", "Unsupported action")
                entity_id, target_name, conflicts = self.docs.document().id, action.name, []
                proposal = {**action.model_dump(), "text":original}
            proposal_id = self.user.collection("aiProposals").document().id
            expires = _utcnow()+timedelta(hours=24)
            stored = {"requestId":request_id,"ownerUid":self.uid,"action":proposal,"entityId":entity_id,"status":"pending","createdAt":_utcnow(),"expiresAt":expires,"promptVersion":PROMPT_VERSION}
            response = {"kind":"proposal","action":action.action,"proposalId":proposal_id,"requestId":request_id,"expiresAt":expires.isoformat(),"targetName":target_name,"proposal":proposal,"preview":{"before":"","after":original},"conflicts":conflicts,"_storedProposal":stored}
            return self._finish(ref, response)
        except (EngineFailure, ContextFailure, ProviderFailure, ValidationError, ValueError) as exc:
            if isinstance(exc, (EngineFailure, ContextFailure)): code = exc.code
            elif isinstance(exc, ProviderFailure): code = {"configuration":"failed-precondition","timeout":"deadline-exceeded","rate_limit":"resource-exhausted"}.get(exc.code,"unavailable")
            else: code = "failed-precondition"
            message_out = str(exc) if not isinstance(exc, ValidationError) else "Model response did not match the routing format"
            details = {**diagnostics,"reason":message_out}
            ref.update({"status":"failed","errorCode":code,"errorMessage":message_out,"errorDetails":details,"completedAt":_utcnow()})
            raise EngineFailure(code, message_out, details) from exc

    def approve(self, request):
        if not isinstance(request, dict): raise EngineFailure("invalid-argument", "Request must be an object")
        proposal_id, approval_id = _id(request.get("proposalId"),"proposalId"), _id(request.get("approvalRequestId"),"approvalRequestId")
        proposal_ref = self.user.collection("aiProposals").document(proposal_id)
        approval_ref = self.user.collection("aiApprovals").document(approval_id)
        tx = self.db.transaction()
        @firestore.transactional
        def commit(transaction):
            previous = approval_ref.get(transaction=transaction)
            if previous.exists:
                if previous.to_dict()["proposalId"] != proposal_id:
                    raise EngineFailure("already-exists", "Approval request ID was reused for another proposal")
                return {**previous.to_dict()["result"],"alreadyProcessed":True}
            snap = proposal_ref.get(transaction=transaction)
            if not snap.exists or snap.to_dict()["status"] != "pending": raise EngineFailure("failed-precondition", "Proposal is no longer pending")
            saved = snap.to_dict(); action = saved["action"]
            if saved["expiresAt"] <= _utcnow(): raise EngineFailure("failed-precondition", "Proposal expired")
            now = _utcnow(); entity_ref = self.docs.document(saved["entityId"]); section_ref = entity_ref.collection("sections").document()
            if action["action"] == "create":
                name = action["name"]
                unread = action["entityType"] == "friend"
                entity = {"entityType":action["entityType"],"name":name,"normalizedName":name.casefold(),"aliases":[],"revision":1,"deleted":False,"unreadCount":1 if unread else 0,"sectionCount":1,"latestSectionAt":now,"createdAt":now,"updatedAt":now}
                transaction.create(entity_ref, entity)
            else:
                current = entity_ref.get(transaction=transaction)
                if not current.exists or current.to_dict().get("deleted"): raise EngineFailure("not-found", "Target note was deleted")
                entity = current.to_dict()
                if entity.get("revision",1) != action["expectedRevision"]: raise EngineFailure("aborted", "Target note changed; regenerate the proposal")
                unread = entity["entityType"] == "friend"
                entity["revision"] = entity.get("revision",1)+1; entity["sectionCount"] = entity.get("sectionCount",0)+1
                entity["unreadCount"] = entity.get("unreadCount",0)+(1 if unread else 0); entity["latestSectionAt"] = now; entity["updatedAt"] = now
                transaction.set(entity_ref, entity)
            transaction.create(section_ref, {"content":action["text"],"pinned":False,"unread":unread,"revision":1,"createdAt":now,"updatedAt":now})
            result = {"entityId":entity_ref.id,"sectionId":section_ref.id,"entityType":entity["entityType"],"name":entity["name"],"revision":entity["revision"],"status":"approved"}
            transaction.update(proposal_ref,{"status":"approved","approvedAt":now,"approvalRequestId":approval_id,"result":result})
            transaction.create(approval_ref,{"proposalId":proposal_id,"result":result,"createdAt":now})
            return result
        try: return commit(tx)
        except Aborted as exc: raise EngineFailure("aborted", "A concurrent change made this proposal stale") from exc

    def reject(self, request):
        proposal_id = _id(request.get("proposalId") if isinstance(request,dict) else None,"proposalId")
        ref = self.user.collection("aiProposals").document(proposal_id)
        snap = ref.get()
        if not snap.exists: raise EngineFailure("not-found", "Proposal not found")
        if snap.to_dict()["status"] == "rejected": return {"status":"rejected","alreadyProcessed":True}
        if snap.to_dict()["status"] != "pending": raise EngineFailure("failed-precondition", "Proposal is no longer pending")
        ref.update({"status":"rejected","rejectedAt":_utcnow()})
        return {"status":"rejected"}
