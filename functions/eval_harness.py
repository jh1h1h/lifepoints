"""Opt-in, budgeted evaluation of routing, conflict checks, and queries."""
import argparse, hashlib, json, os, sys, uuid
from datetime import datetime, timezone
from pathlib import Path
from pydantic import ValidationError
from ai_prompt import PROMPT_VERSION, SYSTEM_PROMPT
from ai_provider import DeepSeekProvider, ProviderFailure
from ai_schema import AddAction, ClarifyAction, CreateAction, QueryAction, parse_action

VALID_ACTIONS = {"create", "add", "query", "clarify"}
CHECKS = ("schemaValid", "actionClassificationCorrect", "entityIdentificationCorrect", "conflictsCorrect", "factualGroundingCorrect")

def _known(case):
    return {record["entityId"]: record for record in case["records"]}

def grade(case, raw):
    expected = case["expected"]; checks = {key: None for key in CHECKS}; actual = None
    try:
        action = parse_action(raw); actual = action.action
    except (ValueError, ValidationError):
        try: actual = json.loads(raw).get("action")
        except Exception: pass
        checks["schemaValid"] = False; checks["actionClassificationCorrect"] = actual == expected["action"]
        return {"actualAction":actual,"checks":checks,"failedChecks":["schemaValid"]}
    checks["schemaValid"] = True; checks["actionClassificationCorrect"] = actual == expected["action"]
    records = _known(case)
    if isinstance(action, CreateAction):
        checks["entityIdentificationCorrect"] = action.entityType == expected.get("entityType") and action.name.casefold() == expected.get("name","").casefold()
        checks["conflictsCorrect"] = not action.conflicts
    elif isinstance(action, AddAction):
        target = records.get(action.entityId)
        checks["entityIdentificationCorrect"] = bool(target and action.entityType == target["entityType"] and action.entityId == expected.get("entityId"))
        known_sections = {section["sectionId"] for section in target.get("sections", [])} if target else set()
        checks["conflictsCorrect"] = set(action.conflicts) <= known_sections and set(action.conflicts) == set(expected.get("conflicts", []))
    elif isinstance(action, QueryAction):
        cited = {section for ref in action.references for section in ref.sectionIds}
        checks["entityIdentificationCorrect"] = expected.get("entityId") is None or any(ref.entityId == expected["entityId"] for ref in action.references)
        checks["factualGroundingCorrect"] = all(text.casefold() in action.answer.casefold() for text in expected.get("answerContains", [])) and set(expected.get("sectionIds", [])) <= cited
    elif isinstance(action, ClarifyAction):
        checks["entityIdentificationCorrect"] = {choice.entityId for choice in action.choices} == set(expected.get("choiceIds", []))
    failed = [key for key,value in checks.items() if value is False]
    return {"actualAction":actual,"checks":checks,"failedChecks":failed}

def _messages(case):
    return [{"role":"system","content":SYSTEM_PROMPT},{"role":"user","content":json.dumps({"userMessage":case["message"],"context":{"retrievedCandidates":case["records"]}},ensure_ascii=False)}]

def _validate_cases(cases):
    if not isinstance(cases,list) or not cases: raise ValueError("CASES must be a non-empty list")
    ids=set()
    for case in cases:
        if not isinstance(case.get("id"),str) or not case["id"] or case["id"] in ids: raise ValueError("Every case needs a unique id")
        ids.add(case["id"])
        if not isinstance(case.get("message"),str) or not case["message"].strip(): raise ValueError(f"{case['id']}: message is required")
        if not isinstance(case.get("records"),list) or case.get("expected",{}).get("action") not in VALID_ACTIONS: raise ValueError(f"{case['id']}: invalid records or expected action")

def evaluate(cases, provider, max_calls, max_usd, input_rate, output_rate, output_path, printer=print):
    _validate_cases(cases); spent=0.0; results=[]; stopped=None
    for case in cases[:max_calls]:
        messages=_messages(case); reservation=(sum(len(m["content"].encode()) for m in messages)*input_rate+provider.max_tokens*output_rate)/1_000_000
        if spent+reservation>max_usd: stopped="budget_preflight"; break
        try:
            reply=provider.complete(messages,str(uuid.uuid4())); graded=grade(case,reply.content)
            cost=(reply.prompt_tokens*input_rate+reply.completion_tokens*output_rate)/1_000_000; spent+=cost; failure=None
        except ProviderFailure as exc:
            reply=None; cost=None; failure=exc.code; stopped="provider_failure_usage_unknown"; graded={"actualAction":None,"checks":{key:None for key in CHECKS},"failedChecks":["providerResponse"]}
        row={"caseId":case["id"],"expectedAction":case["expected"]["action"],**graded,"latencyMs":reply.latency_ms if reply else None,"inputTokens":reply.prompt_tokens if reply else None,"outputTokens":reply.completion_tokens if reply else None,"estimatedCostUsd":round(cost,8) if cost is not None else None,"providerErrorCode":failure}
        row["passed"]=not row["failedChecks"]; results.append(row); printer(json.dumps(row))
        if stopped: break
    summary={"version":2,"evaluatedAt":datetime.now(timezone.utc).isoformat(),"model":provider.model,"promptVersion":PROMPT_VERSION,"casesRequested":min(max_calls,len(cases)),"casesRun":len(results),"passed":sum(r["passed"] for r in results),"failed":sum(not r["passed"] for r in results),"stopped":stopped,"estimatedTotalCostUsd":round(spent,8),"results":[{**r,"caseId":hashlib.sha256(r["caseId"].encode()).hexdigest()[:12]} for r in results]}
    output_path.parent.mkdir(parents=True,exist_ok=True); output_path.write_text(json.dumps(summary,indent=2)+"\n")
    return summary

def main(cases):
    parser=argparse.ArgumentParser(); parser.add_argument("--max-calls",type=int,required=True); parser.add_argument("--max-usd",type=float,required=True); parser.add_argument("--input-usd-per-million",type=float,default=1.32); parser.add_argument("--output-usd-per-million",type=float,default=3.96); parser.add_argument("--output",type=Path,default=Path("deepseek-eval-results.json")); args=parser.parse_args()
    if not 1<=args.max_calls<=len(cases) or args.max_usd<=0: parser.error("invalid limits")
    key=os.environ.get("DEEPSEEK_API_KEY")
    if not key: parser.error("Set DEEPSEEK_API_KEY explicitly; no paid calls run by default")
    try: evaluate(cases,DeepSeekProvider(key),args.max_calls,args.max_usd,args.input_usd_per_million,args.output_usd_per_million,args.output)
    except (ValueError,ProviderFailure) as exc: print(str(exc),file=sys.stderr); return 2
    return 0
