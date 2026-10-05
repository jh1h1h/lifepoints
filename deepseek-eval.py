"""Editable, synthetic DeepSeek evaluation cases. Run this file for the live CLI.

Each case supplies exactly the records shown to the model. Keep real private notes
out of this tracked file. `expected` describes observable behavior, not model prose.
"""

CASES = [
    {
        "id": "add_employment",
        "message": "Kevin is working at Microsoft",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 1, "currentDocument": ""}],
        "expected": {"action": "add", "entityId": "kevin0001", "entityType": "friend", "addedContains": ["Microsoft"], "maxChangedLines": 2},
    },
    {
        "id": "create_friend",
        "message": "Kevin is working at Microsoft",
        "records": [],
        "expected": {"action": "create", "entityType": "friend", "name": "Kevin", "addedContains": ["Microsoft"]},
    },
    {
        "id": "modify_employment",
        "message": "Kevin is now working at Apple",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 1, "currentDocument": "Employment:\nWorking at Microsoft\nHobbies:\nHiking"}],
        "expected": {"action": "modify", "entityId": "kevin0001", "entityType": "friend", "oldText": "Working at Microsoft", "addedContains": ["Apple"], "afterExcludes": ["Microsoft"], "preserve": ["Hobbies:\nHiking"], "maxChangedLines": 1},
    },
    {
        "id": "changed_jobs_unknown",
        "message": "Kevin changed jobs",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 1, "currentDocument": "Employment:\nWorking at Microsoft\nHobbies:\nHiking"}],
        "expected": {"action": "modify", "entityId": "kevin0001", "entityType": "friend", "oldText": "Working at Microsoft", "addedContains": ["unknown"], "afterExcludes": ["Microsoft", "Apple"], "preserve": ["Hobbies:\nHiking"], "maxChangedLines": 1},
    },
    {
        "id": "query_current",
        "message": "Where does Kevin work?",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 1, "currentDocument": "Employment:\nWorking at Apple"}],
        "expected": {"action": "query", "entityId": "kevin0001", "answerContains": ["Apple"], "answerExcludes": ["Microsoft"]},
    },
    {
        "id": "query_previous_full_history",
        "message": "Where did Kevin previously work?",
        "includeFullHistory": True,
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 2, "currentDocument": "Employment:\nWorking at Apple", "historicalDeltas": "Revision 0 -> 1\nEvent ID: event0001; Operation: create; Change type: new_information\n+ Employment:\n+ Working at Microsoft\nRevision 1 -> 2\nEvent ID: event0002; Operation: modify; Change type: new_information\n- Working at Microsoft\n+ Working at Apple"}],
        "expected": {"action": "query", "entityId": "kevin0001", "answerContains": ["Microsoft"], "notCurrent": ["Microsoft"], "requiredEventIds": ["event0001", "event0002"]},
    },
    {
        "id": "query_previous_current_only",
        "message": "Where did Kevin previously work?",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 2, "currentDocument": "Employment:\nWorking at Apple"}],
        "expected": {"action": "query", "entityId": "kevin0001", "answerExcludes": ["Microsoft"], "answerContainsAny": ["unknown", "not recorded", "don't know", "cannot tell", "unavailable", "history"]},
    },
    {
        "id": "add_project_next_step",
        "message": "Complete AI integration for Friendfolio",
        "records": [{"entityId": "project001", "entityType": "project", "name": "Friendfolio", "aliases": [], "revision": 1, "currentDocument": "Goals:\nBuild Friendfolio."}],
        "expected": {"action": "add", "entityId": "project001", "entityType": "project", "addedContains": ["AI integration"], "addedExcludes": ["completed", "finished", "done"], "preserve": ["Goals:\nBuild Friendfolio."], "maxChangedLines": 2},
    },
    {
        "id": "create_project",
        "message": "Create a new project called Friendfolio",
        "records": [],
        "expected": {"action": "create", "entityType": "project", "name": "Friendfolio"},
    },
    {
        "id": "delete_hobby",
        "message": "Remove the information about Kevin's hiking hobby",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 1, "currentDocument": "Employment:\nWorking at Apple\nHobbies:\nHiking"}],
        "expected": {"action": "delete", "entityId": "kevin0001", "entityType": "friend", "scope": "content", "removedContains": ["Hiking"], "afterExcludes": ["Hiking"], "preserve": ["Employment:\nWorking at Apple"]},
    },
    {
        "id": "clarify_two_kevins",
        "message": "Kevin changed jobs",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": ["Kevin Tan"], "revision": 1, "currentDocument": "Working at Microsoft"}, {"entityId": "kevin0002", "entityType": "friend", "name": "Kevin", "aliases": ["Kevin Lim"], "revision": 1, "currentDocument": "Working at Apple"}],
        "expected": {"action": "clarify", "choiceIds": ["kevin0001", "kevin0002"]},
    },
    {
        "id": "correct_birthday",
        "message": "Kevin's birthday is actually 15 March, not 16 March",
        "records": [{"entityId": "kevin0001", "entityType": "friend", "name": "Kevin", "aliases": [], "revision": 1, "currentDocument": "Birthday:\n16 March\nHobbies:\nHiking"}],
        "expected": {"action": "modify", "entityId": "kevin0001", "entityType": "friend", "oldText": "16 March", "addedContains": ["15 March"], "afterExcludes": ["16 March"], "preserve": ["Hobbies:\nHiking"], "changeType": "correction", "maxChangedLines": 1},
    },
]


if __name__ == "__main__":
    from pathlib import Path
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent / "functions"))
    from eval_harness import main

    raise SystemExit(main(CASES))
