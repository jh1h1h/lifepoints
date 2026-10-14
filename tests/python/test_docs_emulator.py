import os, uuid
import pytest
from firebase_functions import https_fn
from google.cloud import firestore
from docs_service import handle

pytestmark=pytest.mark.skipif(not os.getenv("FIRESTORE_EMULATOR_HOST"),reason="Firestore emulator required")

@pytest.fixture
def env(): return firestore.Client(project="demo-lifepoints"),f"sections-{uuid.uuid4().hex}"
def op(): return str(uuid.uuid4())
def create(db,uid,kind="friend",content="first thought"):
    return handle(db,uid,{"action":"create","operationId":op(),"entityType":kind,"name":"Henry","content":content})

def test_friend_sections_unread_and_project_sections_read(env):
    db,uid=env; friend=create(db,uid); project=create(db,uid,"project","project thought")
    assert handle(db,uid,{"action":"summary"})["unreadFriends"]==1
    assert handle(db,uid,{"action":"list_sections","entityId":friend["id"]})["sections"][0]["unread"] is True
    assert handle(db,uid,{"action":"list_sections","entityId":project["id"]})["sections"][0]["unread"] is False

def test_edit_pin_read_and_idempotency(env):
    db,uid=env; created=create(db,uid); section=handle(db,uid,{"action":"list_sections","entityId":created["id"]})["sections"][0]
    request={"action":"update_section","operationId":op(),"entityId":created["id"],"sectionId":section["id"],"expectedRevision":1,"content":"reworded"}
    first=handle(db,uid,request); second=handle(db,uid,request)
    assert first["revision"]==second["revision"] and second["alreadyProcessed"]
    with pytest.raises(https_fn.HttpsError): handle(db,uid,{**request,"content":"different"})
    handle(db,uid,{"action":"set_section_unread","operationId":op(),"entityId":created["id"],"sectionId":section["id"],"expectedRevision":2,"unread":False})
    assert handle(db,uid,{"action":"summary"})["unreadFriends"]==0

def test_friend_list_unread_first_and_recent_projects(env):
    db,uid=env; unread=create(db,uid); read=create(db,uid,content="")
    listed=handle(db,uid,{"action":"list","entityType":"friend"})["entities"]
    assert listed[0]["id"]==unread["id"] and listed[-1]["id"]==read["id"]
    project=create(db,uid,"project","latest")
    recent=handle(db,uid,{"action":"recent_project_sections","limit":15})["sections"]
    assert recent[0]["entityId"]==project["id"] and recent[0]["content"]=="latest"
