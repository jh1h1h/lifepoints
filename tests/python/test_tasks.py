import json
import tempfile
import unittest
from pathlib import Path

from scripts.generate_tasks import generate, validate

VALID = {"id": "test", "category": "growth", "name": "Task", "description": "Description", "points": 5, "icon": "book"}


class TaskTests(unittest.TestCase):
    def test_real_tasks_generate_deterministically(self):
        first = generate()
        self.assertEqual(first, generate(check=True))
        self.assertGreater(len(json.loads(first)), 12)

    def test_invalid_definitions(self):
        cases = [
            ([VALID, VALID.copy()], "duplicates"),
            ([{**VALID, "category": "wrong"}], "category"),
            ([{**VALID, "points": -1}], "positive"),
            ([{**VALID, "points": 0}], "positive"),
            ([{key: value for key, value in VALID.items() if key != "name"}], "missing name"),
            ([{**VALID, "id": ""}], "non-empty"),
            (["wrong"], "dictionary"),
            ({}, "list"),
        ]
        for tasks, expected in cases:
            with self.subTest(expected=expected):
                self.assertIn(expected, " ".join(validate(tasks)))

    def test_missing_tasks_and_invalid_generator(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "tasks.py"
            output = Path(directory) / "tasks.json"
            source.write_text("VALUE = 3\n")
            with self.assertRaisesRegex(ValueError, "TASKS"):
                generate(source, output)
            source.write_text("TASKS = [{'id': 'x'}]\n")
            with self.assertRaisesRegex(ValueError, "missing"):
                generate(source, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
