import copy

import pytest

from docs_delta import HistoryError, apply_patch, content_hash, format_deltas, make_patch, reconstruct_history, verify_patch


def event(before, after, revision, operation="update_content"):
    return {"baseRevision": revision - 1, "newRevision": revision,
            "operation": operation, "source": "manual", "patch": make_patch(before, after),
            "beforeHash": content_hash(before), "afterHash": content_hash(after)}


def test_initial_empty_and_multiline_unicode_crlf():
    initial = ""
    first = "Employment:\r\nApple 🍎\r\nHobbies:\r\nHiking\r\n"
    second = "Employment:\r\nGoogle 🍎\r\nHobbies:\r\nHiking\r\n"
    third = second + "Birthday: 15 March\n"
    events = [event(initial, first, 1, "create"), event(first, second, 2), event(second, third, 3)]
    assert reconstruct_history(events) == [initial, first, second, third]
    assert "Hobbies" in reconstruct_history(events)[2]
    assert "-Apple 🍎" in format_deltas(events)
    assert "+Google 🍎" in format_deltas(events)
    assert apply_patch("", make_patch("", "")) == ""


def test_hashes_and_corruption_are_detected():
    edits = [event("", "One\n", 1), event("One\n", "Two\n", 2)]
    assert verify_patch("One\n", edits[1]["patch"], edits[1]["beforeHash"], edits[1]["afterHash"]) == "Two\n"
    with pytest.raises(HistoryError, match="Missing"):
        reconstruct_history(edits[1:])
    corrupt = copy.deepcopy(edits)
    corrupt[1]["afterHash"] = "0" * 64
    with pytest.raises(HistoryError, match="hash"):
        reconstruct_history(corrupt)
    corrupt = copy.deepcopy(edits)
    corrupt[1]["patch"] = corrupt[1]["patch"].replace("One", "Wrong")
    with pytest.raises(HistoryError, match="Patch"):
        reconstruct_history(corrupt)


def test_metadata_edits_keep_content_hash():
    edits = [event("", "Goals:\nBuild it", 1, "create"), event("Goals:\nBuild it", "Goals:\nBuild it", 2, "rename")]
    assert reconstruct_history(edits)[-1] == "Goals:\nBuild it"
    assert edits[1]["beforeHash"] == edits[1]["afterHash"]
