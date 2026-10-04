"""Opt-in, budget-capped DeepSeek evaluation with synthetic records only."""

import argparse
import json
import os
import sys
import uuid

from ai_prompt import SYSTEM_PROMPT
from ai_provider import DeepSeekProvider, ProviderFailure
from ai_schema import parse_action


KEVIN = {"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [],
         "revision": 1, "currentDocument": "Employment:\nWorking at Microsoft\nHobbies:\nHiking"}
CASES = [
    ("add-employment", "Kevin is working at Microsoft", [{**KEVIN, "currentDocument": ""}], "add", "Microsoft"),
    ("create-friend", "Kevin is working at Microsoft", [], "create", "Microsoft"),
    ("modify-employment", "Kevin is now working at Apple", [KEVIN], "modify", "Apple"),
    ("unknown-employer", "Kevin changed jobs", [KEVIN], "modify", "unknown"),
    ("add-project", "Complete AI integration for Friendfolio", [{**KEVIN, "entityId": "project001", "entityType": "project", "name": "Friendfolio", "currentDocument": ""}], "add", "Complete AI integration"),
    ("create-project", "Create a project called Friendfolio", [], "create", "Friendfolio"),
    ("query-current", "Where does Kevin work?", [{**KEVIN, "currentDocument": "Working at Apple"}], "query", "Apple"),
    ("query-history", "Where did Kevin work previously?", [{**KEVIN, "revision": 2, "currentDocument": "Working at Apple", "historicalDeltas": "Revision 0 -> 1\n+ Working at Microsoft\nRevision 1 -> 2\n- Working at Microsoft\n+ Working at Apple"}], "query", "Microsoft"),
    ("clarify-name", "Kevin changed jobs", [{**KEVIN, "name": "Kevin Tan"}, {**KEVIN, "entityId": "kevin0002", "name": "Kevin Lim"}], "clarify", "Kevin"),
    ("delete-hobby", "Remove the information about Kevin's hiking hobby", [KEVIN], "delete", "Hiking"),
    ("correct-birthday", "Kevin's birthday is actually 15 March, not 16 March", [{**KEVIN, "currentDocument": "Birthday:\n16 March"}], "modify", "15 March"),
    ("query-missing", "When is Kevin's birthday?", [{**KEVIN, "currentDocument": "Employment:\nWorking at Apple"}], "query", "not"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-calls", type=int, required=True)
    parser.add_argument("--max-usd", type=float, required=True)
    args = parser.parse_args()
    if not 1 <= args.max_calls <= len(CASES) or args.max_usd <= 0:
        parser.error("Provide 1–12 calls and a positive dollar budget")
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        parser.error("DEEPSEEK_API_KEY must be set explicitly; paid evaluation is disabled by default")
    provider = DeepSeekProvider(key)
    if provider.model != "deepseek-v4-pro":
        parser.error("Live evaluation budget estimates support deepseek-v4-pro only")
    provider.max_retries = 0
    spent = 0.0
    failures = 0
    for label, message, records, expected_action, expected_text in CASES[:args.max_calls]:
        context = {"userMessage": message, "includeFullHistory": bool(records and "historicalDeltas" in records[0]),
                   "context": {"mode": "full_history" if records and "historicalDeltas" in records[0] else "current_only",
                               "retrievedCandidates": records}}
        messages = [{"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(context, ensure_ascii=False)}]
        # Conservative preflight reservation: all input chars as tokens and all output tokens.
        reservation = sum(len(item["content"]) for item in messages) * 1.32 / 1_000_000
        reservation += provider.max_tokens * 3.96 / 1_000_000
        if spent + reservation > args.max_usd:
            print(json.dumps({"stopped": "budget", "estimatedSpentUsd": round(spent, 6)}))
            break
        result = None
        try:
            reply = provider.complete(messages, str(uuid.uuid4()))
            result = parse_action(reply.content)
            relevant = json.dumps(result.model_dump(), ensure_ascii=False)
            passed = result.action == expected_action and expected_text.casefold() in relevant.casefold()
            prompt_tokens, completion_tokens, latency = reply.prompt_tokens, reply.completion_tokens, reply.latency_ms
            error = None
        except (ProviderFailure, ValueError) as exc:
            passed = False
            prompt_tokens = completion_tokens = latency = 0
            error = str(exc)
        spent += prompt_tokens * 1.32 / 1_000_000 + completion_tokens * 3.96 / 1_000_000
        failures += not passed
        print(json.dumps({"case": label, "pass": passed, "action": result.action if result else None,
                          "latencyMs": latency, "promptTokens": prompt_tokens,
                          "completionTokens": completion_tokens, "estimatedCostUsd": round(spent, 6),
                          "error": error}))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
