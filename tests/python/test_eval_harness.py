import json
import runpy
from pathlib import Path

import pytest

from ai_provider import ModelReply, ProviderFailure
from eval_harness import _validate_cases, evaluate, grade


CASES = runpy.run_path(str(Path(__file__).resolve().parents[2] / "deepseek-eval.py"))["CASES"]


def response_for(case):
    expected = case["expected"]
    action = expected["action"]
    base = {"schemaVersion": 1, "action": action}
    if action == "create":
        return {**base, "entityType": expected["entityType"], "name": expected["name"],
                "content": "Working at Microsoft" if expected["entityType"] == "friend" else "",
                "changeType": "new_information", "reason": ""}
    if action in {"add", "modify", "delete"}:
        target = next(item for item in case["records"] if item["entityId"] == expected["entityId"])
        base.update(entityType=target["entityType"], entityId=target["entityId"],
                    expectedRevision=target["revision"], scope="content", reason="")
        if action == "add":
            base.update(newText="Working at Microsoft" if target["entityType"] == "friend" else
                        "Next step: Complete AI integration", afterText=None, changeType="new_information")
        elif action == "modify":
            replacement = {"modify_employment": "Working at Apple",
                           "changed_jobs_unknown": "Changed jobs; current employer unknown",
                           "correct_birthday": "15 March"}[case["id"]]
            base.update(oldText=expected["oldText"], newText=replacement,
                        changeType=expected.get("changeType", "new_information"))
        else:
            base.update(oldText="Hiking", changeType="unspecified")
        return base
    if action == "query":
        answer = {"query_current": "Kevin works at Apple.",
                  "query_previous_full_history": "Kevin previously worked at Microsoft; Apple is current.",
                  "query_previous_current_only": "Previous employment is unavailable without history."}[case["id"]]
        target = case["records"][0]
        return {**base, "answer": answer,
                "references": [{"entityId": target["entityId"], "revision": target["revision"],
                                "eventIds": case["expected"].get("requiredEventIds", [])}]}
    return {**base, "question": "Which Kevin?", "choices": [
        {"entityId": record["entityId"], "entityType": record["entityType"],
         "name": record["name"]} for record in case["records"]]}


@pytest.mark.parametrize("case", CASES, ids=lambda item: item["id"])
def test_editable_case_has_a_passing_structured_response(case):
    assert grade(case, json.dumps(response_for(case)))["failedChecks"] == []


def test_scope_and_unrelated_content_are_checked():
    case = next(item for item in CASES if item["id"] == "modify_employment")
    response = response_for(case)
    response["oldText"] = "Employment:\nWorking at Microsoft\nHobbies:\nHiking"
    result = grade(case, json.dumps(response))
    assert result["checks"]["proposedModificationCorrect"] is False


def test_query_must_be_grounded_and_not_present_old_fact_as_current():
    current = next(item for item in CASES if item["id"] == "query_current")
    response = response_for(current)
    response["answer"] = "Kevin works at Microsoft."
    assert grade(current, json.dumps(response))["checks"]["factualGroundingCorrect"] is False
    history = next(item for item in CASES if item["id"] == "query_previous_full_history")
    response = response_for(history)
    response["answer"] = "Kevin currently works at Microsoft."
    assert grade(history, json.dumps(response))["checks"]["factualGroundingCorrect"] is False


def test_schema_and_invented_target_fail():
    case = CASES[0]
    assert grade(case, '{"action":"add"}')["checks"]["schemaValid"] is False
    response = response_for(case)
    response["entityId"] = "invented01"
    result = grade(case, json.dumps(response))
    assert result["checks"]["entityIdentificationCorrect"] is False
    assert result["checks"]["proposedModificationCorrect"] is False


class FakeProvider:
    model = "deepseek-v4-pro"
    max_tokens = 1400

    def __init__(self, response=None, error=None):
        self.calls = 0
        self.response = response
        self.error = error

    def complete(self, messages, request_id):
        self.calls += 1
        if self.error:
            raise self.error
        return ModelReply(json.dumps(self.response), request_id, 100, 40, 123)


def test_budget_preflight_prevents_paid_call_and_saves_summary(tmp_path):
    provider = FakeProvider(response_for(CASES[0]))
    path = tmp_path / "summary.json"
    result = evaluate(CASES[:1], provider, 1, 0.000001, 1.32, 3.96, path, printer=lambda _: None)
    assert provider.calls == 0 and result["stopped"] == "budget_preflight"
    assert path.exists()


def test_per_case_metrics_cost_and_summary_are_private(tmp_path):
    provider = FakeProvider(response_for(CASES[0]))
    path = tmp_path / "summary.json"
    result = evaluate(CASES[:1], provider, 1, 0.10, 1.32, 3.96, path, printer=lambda _: None)
    assert provider.calls == 1 and result["passed"] == 1
    row = result["results"][0]
    assert row["inputTokens"] == 100 and row["outputTokens"] == 40
    assert row["latencyMs"] == 123 and row["estimatedCostUsd"] == 0.0002904
    text = path.read_text()
    assert "Microsoft" not in text and "Working at" not in text
    assert "add_employment" not in text and "DEEPSEEK_API_KEY" not in text


def test_unknown_provider_usage_stops_without_another_call(tmp_path):
    provider = FakeProvider(error=ProviderFailure("timeout", "Synthetic timeout"))
    result = evaluate(CASES[:2], provider, 2, 0.10, 1.32, 3.96,
                      tmp_path / "summary.json", printer=lambda _: None)
    assert provider.calls == 1 and result["stopped"] == "provider_failure_usage_unknown"
    assert result["costMayBeIncomplete"] is True


def test_case_validation_rejects_duplicate_ids():
    with pytest.raises(ValueError, match="Duplicate case id"):
        _validate_cases([CASES[0], CASES[0]])
