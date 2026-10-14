import json, os, uuid
import pytest
from google.cloud import firestore
from ai_engine import ActionEngine, EngineFailure
from ai_provider import ModelReply
from docs_service import handle

pytestmark=pytest.mark.skipif(not os.getenv("FIRESTORE_EMULATOR_HOST"),reason="Firestore emulator required")
class Provider:
    def __init__(self,response): self.response=response; self.calls=[]
    def complete(self,messages,request_id): self.calls.append(messages); return ModelReply(json.dumps(self.response),"response",10,10,1)
@pytest.fixture
def env(): return firestore.Client(project="demo-lifepoints"),f"ai-sections-{uuid.uuid4().hex}"
def create(db,uid): return handle(db,uid,{"action":"create","operationId":str(uuid.uuid4()),"entityType":"friend","name":"Henry","content":"Henry goes to Yale"})

def test_exact_original_text_and_validated_conflict(env):
    db,uid=env; made=create(db,uid); section=handle(db,uid,{"action":"list_sections","entityId":made["id"]})["sections"][0]
    response={"schemaVersion":2,"action":"add","entityType":"friend","entityId":made["id"],"expectedRevision":1,"conflicts":[section["id"]]}
    engine=ActionEngine(db,uid,Provider(response)); original="henry goes to harvard!!!"
    proposal=engine.interpret({"message":original,"requestId":str(uuid.uuid4())})
    assert proposal["proposal"]["text"]==original and proposal["conflicts"][0]["content"]=="Henry goes to Yale"
    engine.approve({"proposalId":proposal["proposalId"],"approvalRequestId":str(uuid.uuid4())})
    contents=[s["content"] for s in handle(db,uid,{"action":"list_sections","entityId":made["id"]})["sections"]]
    assert original in contents

def test_rejects_invented_conflict_section(env):
    db,uid=env; made=create(db,uid)
    response={"schemaVersion":2,"action":"add","entityType":"friend","entityId":made["id"],"expectedRevision":1,"conflicts":["invented1"]}
    with pytest.raises(EngineFailure,match="unavailable section"):
        ActionEngine(db,uid,Provider(response)).interpret({"message":"henry goes to harvard","requestId":str(uuid.uuid4())})

def test_query_cites_current_section(env):
    db,uid=env; made=create(db,uid); section=handle(db,uid,{"action":"list_sections","entityId":made["id"]})["sections"][0]
    response={"schemaVersion":2,"action":"query","answer":"Henry goes to Yale.","references":[{"entityId":made["id"],"sectionIds":[section["id"]]}]}
    result=ActionEngine(db,uid,Provider(response)).interpret({"message":"Where does Henry study?","requestId":str(uuid.uuid4())})
    assert result["kind"]=="query" and "Yale" in result["answer"]
