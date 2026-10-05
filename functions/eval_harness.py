"""Opt-in, budgeted evaluation of the production DeepSeek action contract."""

import argparse
import hashlib
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from pydantic import ValidationError

from ai_engine import ActionEngine, EngineFailure, _apply
from ai_prompt import PROMPT_VERSION, SYSTEM_PROMPT
from ai_provider import DeepSeekProvider, ProviderFailure
from ai_schema import (AddAction, ClarifyAction, CreateAction, DeleteAction,
                       ModifyAction, QueryAction, parse_action)


MUTATIONS = {"create", "add", "modify", "delete"}
VALID_ACTIONS = MUTATIONS | {"query", "clarify"}
CHECKS = ("actionClassificationCorrect", "entityIdentificationCorrect",
          "proposedModificationCorrect", "unrelatedContentPreserved",
          "schemaValid", "clarificationCorrect", "factualGroundingCorrect")


def _contains(text, fragments):
    return all(fragment.casefold() in text.casefold() for fragment in fragments)


def _excludes(text, fragments):
    return all(fragment.casefold() not in text.casefold() for fragment in fragments)


def _candidate_context(case):
    records = case["records"]
    candidates = [{"id": item["entityId"], "entityType": item["entityType"],
                   "name": item["name"], "revision": item["revision"],
                   "content": item["currentDocument"]} for item in records]
    histories = {}
    for item in records:
        events = re.findall(r"Event ID: ([A-Za-z0-9_-]+)", item.get("historicalDeltas", ""))
        histories[item["entityId"]] = [{"eventId": event} for event in events]
    return SimpleNamespace(candidates=candidates, histories=histories)


def _not_current(answer, fragments):
    for fragment in fragments:
        escaped = re.escape(fragment)
        if re.search(rf"\b(?:currently|now|still|presently)\b.{{0,35}}\b(?:at|for|with|by)\s+{escaped}|{escaped}.{{0,35}}\b(?:current|present)\s+(?:employer|job|workplace)\b", answer, re.I | re.S):
            return False
    return True


def grade(case, raw):
    """Deterministic checks; no second paid model is used as a judge."""
    expected = case["expected"]
    checks = {key: None for key in CHECKS}
    actual_action = None
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict) and isinstance(obj.get("action"), str):
            actual_action = obj["action"]
        action = parse_action(raw)
    except (ValueError, ValidationError):
        checks["schemaValid"] = False
        checks["actionClassificationCorrect"] = actual_action == expected["action"]
        return {"actualAction": actual_action, "checks": checks, "failedChecks": ["schemaValid"]}
    actual_action = action.action
    checks["schemaValid"] = True
    checks["actionClassificationCorrect"] = actual_action == expected["action"]
    context = _candidate_context(case)
    safe = True
    try:
        ActionEngine._validate(None, action, context, case.get("includeFullHistory", False))
    except EngineFailure:
        safe = False
    if isinstance(action, CreateAction):
        checks["entityIdentificationCorrect"] = (action.entityType == expected.get("entityType")
            and action.name.casefold().strip() == expected.get("name", "").casefold().strip())
    elif isinstance(action, (AddAction, ModifyAction, DeleteAction)):
        checks["entityIdentificationCorrect"] = (safe and action.entityId == expected.get("entityId")
            and action.entityType == expected.get("entityType"))
    elif isinstance(action, QueryAction):
        required_id = expected.get("entityId")
        checks["entityIdentificationCorrect"] = safe and (required_id is None or any(
            ref.entityId == required_id for ref in action.references))
    else:
        expected_ids = set(expected.get("choiceIds", []))
        actual_ids = {choice.entityId for choice in action.choices}
        checks["entityIdentificationCorrect"] = safe and actual_ids == expected_ids

    if isinstance(action, (CreateAction, AddAction, ModifyAction, DeleteAction)):
        before = ""
        after = ""
        fragment = ""
        if isinstance(action, CreateAction):
            after = fragment = action.content
        else:
            target = next((record for record in case["records"] if record["entityId"] == action.entityId), None)
            if target is not None:
                before = target["currentDocument"]
                try:
                    if isinstance(action, DeleteAction) and action.scope == "entity":
                        after = ""
                    else:
                        after = _apply(action, before)
                except EngineFailure:
                    safe = False
            else:
                safe = False
            fragment = (action.newText if isinstance(action, (AddAction, ModifyAction)) else
                        action.oldText or "")
        checks["proposedModificationCorrect"] = (safe
            and action.action == expected["action"]
            and (not isinstance(action, DeleteAction) or action.scope == expected.get("scope"))
            and ("oldText" not in expected or getattr(action, "oldText", None) == expected["oldText"])
            and ("changeType" not in expected or action.changeType == expected["changeType"])
            and _contains(fragment, expected.get("addedContains", []) + expected.get("removedContains", []))
            and _excludes(fragment, expected.get("addedExcludes", []))
            and ("maxChangedLines" not in expected or len(fragment.splitlines()) <= expected["maxChangedLines"])
            and _excludes(after, expected.get("afterExcludes", [])))
        checks["unrelatedContentPreserved"] = (safe and _contains(before, expected.get("preserve", []))
            and _contains(after, expected.get("preserve", [])))
    elif isinstance(action, QueryAction):
        answer = action.answer
        cited_events = {event_id for ref in action.references for event_id in ref.eventIds}
        checks["factualGroundingCorrect"] = (safe and _contains(answer, expected.get("answerContains", []))
            and _excludes(answer, expected.get("answerExcludes", []))
            and set(expected.get("requiredEventIds", [])) <= cited_events
            and (not expected.get("answerContainsAny") or any(
                fragment.casefold() in answer.casefold() for fragment in expected["answerContainsAny"]))
            and _not_current(answer, expected.get("notCurrent", [])))
    else:
        checks["clarificationCorrect"] = (safe and bool(action.question.strip())
            and checks["entityIdentificationCorrect"])

    failed = [name for name, value in checks.items() if value is False]
    return {"actualAction": actual_action, "checks": checks, "failedChecks": failed}


def _messages(case):
    records = case["records"]
    full = case.get("includeFullHistory", False)
    context = {"userMessage": case["message"], "includeFullHistory": full,
               "context": {"mode": "full_history" if full else "current_only",
                           "retrievedCandidates": records}}
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)}]


def _validate_cases(cases):
    if not isinstance(cases, list) or not cases:
        raise ValueError("CASES must be a non-empty list")
    ids = set()
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get("id"), str) or not case["id"]:
            raise ValueError("Every case needs a non-empty id")
        if case["id"] in ids:
            raise ValueError(f"Duplicate case id: {case['id']}")
        ids.add(case["id"])
        if not isinstance(case.get("message"), str) or not case["message"].strip():
            raise ValueError(f"{case['id']}: message is required")
        expected = case.get("expected")
        if not isinstance(case.get("records"), list) or not isinstance(expected, dict) or expected.get("action") not in VALID_ACTIONS:
            raise ValueError(f"{case['id']}: records or expected action is invalid")
        if type(case.get("includeFullHistory", False)) is not bool:
            raise ValueError(f"{case['id']}: includeFullHistory must be Boolean")
        seen = set()
        for record in case["records"]:
            required = ("entityId", "entityType", "name", "aliases", "revision", "currentDocument")
            if not isinstance(record, dict) or any(key not in record for key in required):
                raise ValueError(f"{case['id']}: record is incomplete")
            if (not isinstance(record["entityId"], str) or not isinstance(record["name"], str)
                    or record["entityType"] not in {"friend", "project"}
                    or type(record["revision"]) is not int or record["revision"] < 1
                    or not isinstance(record["currentDocument"], str)
                    or not isinstance(record["aliases"], list)):
                raise ValueError(f"{case['id']}: record fields are invalid")
            if record["entityId"] in seen:
                raise ValueError(f"{case['id']}: duplicate entity ID")
            seen.add(record["entityId"])
            if not case.get("includeFullHistory") and "historicalDeltas" in record:
                raise ValueError(f"{case['id']}: current-only context must not include history")
        action = expected["action"]
        if action == "create" and (expected.get("entityType") not in {"friend", "project"}
                                   or not isinstance(expected.get("name"), str) or not expected["name"]):
            raise ValueError(f"{case['id']}: create needs entityType and name")
        if action in {"add", "modify", "delete"} and (expected.get("entityId") not in seen
                or expected.get("entityType") not in {"friend", "project"}):
            raise ValueError(f"{case['id']}: mutation needs a retrieved entityId and entityType")
        if action == "clarify" and (not isinstance(expected.get("choiceIds"), list)
                                    or not set(expected["choiceIds"]) <= seen):
            raise ValueError(f"{case['id']}: clarify needs retrieved choiceIds")
        if action == "query" and expected.get("entityId") is not None and expected["entityId"] not in seen:
            raise ValueError(f"{case['id']}: query entityId is not retrieved")
        if "maxChangedLines" in expected and (type(expected["maxChangedLines"]) is not int
                                            or expected["maxChangedLines"] < 1):
            raise ValueError(f"{case['id']}: maxChangedLines must be positive")


def evaluate(cases, provider, max_calls, max_usd, input_rate, output_rate, output_path, printer=print):
    """Run cases sequentially; reserve peak worst-case output before each call."""
    _validate_cases(cases)
    spent = 0.0
    results = []
    stopped = None
    for case in cases[:max_calls]:
        messages = _messages(case)
        # UTF-8 bytes are a conservative input-token bound for these text cases.
        reserved_input = sum(len(item["content"].encode("utf-8")) for item in messages) + 256
        reservation = (reserved_input * input_rate + provider.max_tokens * output_rate) / 1_000_000
        if spent + reservation > max_usd:
            stopped = "budget_preflight"
            break
        reply = None
        failure = None
        try:
            reply = provider.complete(messages, str(uuid.uuid4()))
            graded = grade(case, reply.content)
        except ProviderFailure as exc:
            failure = exc.code
            graded = {"actualAction": None, "checks": {name: None for name in CHECKS},
                      "failedChecks": ["providerResponse"]}
        if reply is None or reply.prompt_tokens <= 0 or reply.completion_tokens <= 0:
            cost = None
            stopped = "usage_unknown" if failure is None else "provider_failure_usage_unknown"
        else:
            cost = (reply.prompt_tokens * input_rate + reply.completion_tokens * output_rate) / 1_000_000
            spent += cost
        row = {"caseId": case["id"], "expectedAction": case["expected"]["action"],
               **graded, "latencyMs": reply.latency_ms if reply else None,
               "inputTokens": reply.prompt_tokens if reply else None,
               "outputTokens": reply.completion_tokens if reply else None,
               "estimatedCostUsd": round(cost, 8) if cost is not None else None,
               "providerErrorCode": failure}
        row["passed"] = not row["failedChecks"] and all(value is not False for value in row["checks"].values())
        results.append(row)
        printer(json.dumps(row, ensure_ascii=False))
        if stopped:
            break
    summary = {"version": 1, "evaluatedAt": datetime.now(timezone.utc).isoformat(),
               "model": provider.model, "promptVersion": PROMPT_VERSION,
               "casesRequested": min(max_calls, len(cases)), "casesRun": len(results),
               "passed": sum(row["passed"] for row in results),
               "failed": sum(not row["passed"] for row in results),
               "stopped": stopped, "estimatedTotalCostUsd": round(spent, 8),
               "costMayBeIncomplete": stopped in {"usage_unknown", "provider_failure_usage_unknown"},
               "inputUsdPerMillion": input_rate, "outputUsdPerMillion": output_rate,
               "results": [{**row, "caseId": hashlib.sha256(row["caseId"].encode()).hexdigest()[:12]}
                           for row in results]}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    printer(json.dumps({key: value for key, value in summary.items() if key != "results"}))
    return summary


def main(cases):
    parser = argparse.ArgumentParser(description="Run paid DeepSeek action evaluations on editable synthetic cases")
    parser.add_argument("--max-calls", type=int, required=True)
    parser.add_argument("--max-usd", type=float, required=True)
    parser.add_argument("--input-usd-per-million", type=float, default=1.32)
    parser.add_argument("--output-usd-per-million", type=float, default=3.96)
    parser.add_argument("--output", type=Path, default=Path("deepseek-eval-results.json"))
    args = parser.parse_args()
    if not 1 <= args.max_calls <= len(cases) or not 0 < args.max_usd < float("inf"):
        parser.error("--max-calls must select 1–all cases and --max-usd must be positive and finite")
    if any(not 0 < rate < float("inf") for rate in (args.input_usd_per_million, args.output_usd_per_million)):
        parser.error("Pricing rates must be positive and finite")
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        parser.error("Set DEEPSEEK_API_KEY explicitly in the local environment; no paid calls run by default")
    try:
        _validate_cases(cases)
        provider = DeepSeekProvider(key)
    except (ValueError, ProviderFailure) as exc:
        parser.error(str(exc))
    if provider.model != "deepseek-v4-pro" and (args.input_usd_per_million, args.output_usd_per_million) == (1.32, 3.96):
        parser.error("For another model, explicitly provide both current token prices")
    provider.max_retries = 0
    try:
        summary = evaluate(cases, provider, args.max_calls, args.max_usd,
                           args.input_usd_per_million, args.output_usd_per_million, args.output)
    except OSError as exc:
        parser.error(f"Could not save evaluation summary: {exc}")
    print(f"Estimated run cost: ${summary['estimatedTotalCostUsd']:.6f} USD"
          + (" (incomplete: upstream usage unavailable)" if summary["costMayBeIncomplete"] else ""))
    print(f"Summary: {args.output}")
    return 0 if summary["failed"] == 0 and not summary["stopped"] else 1


if __name__ == "__main__":
    print("Run the root deepseek-eval.py to load its editable CASES", file=sys.stderr)
    raise SystemExit(2)
