import json
import pytest
from eval_harness import _validate_cases, grade

def record():
    return {"entityId":"henry0001","entityType":"friend","name":"Henry","aliases":[],"revision":1,"sections":[{"sectionId":"section001","content":"Henry goes to Yale","createdAt":"2026-01-01"}]}

def test_grades_routing_and_conflicts():
    case={"id":"route","message":"henry goes to harvard","records":[record()],"expected":{"action":"add","entityId":"henry0001","conflicts":["section001"]}}
    raw=json.dumps({"schemaVersion":2,"action":"add","entityType":"friend","entityId":"henry0001","expectedRevision":1,"conflicts":["section001"]})
    assert grade(case,raw)["failedChecks"]==[]

def test_grades_query_citations():
    case={"id":"query","message":"Where?","records":[record()],"expected":{"action":"query","entityId":"henry0001","answerContains":["Yale"],"sectionIds":["section001"]}}
    raw=json.dumps({"schemaVersion":2,"action":"query","answer":"Henry goes to Yale.","references":[{"entityId":"henry0001","sectionIds":["section001"]}]})
    assert grade(case,raw)["failedChecks"]==[]

def test_case_validation_rejects_duplicates():
    case={"id":"one","message":"x","records":[],"expected":{"action":"create"}}
    with pytest.raises(ValueError): _validate_cases([case,case])
