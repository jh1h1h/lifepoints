"""Validate tasks.py and generate the frontend's deterministic task data."""
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIELDS = {"id", "category", "name", "description", "points", "icon"}
CATEGORIES = {"growth", "people", "life", "play"}


def validate(tasks):
    errors = []
    if not isinstance(tasks, list):
        return ["TASKS must be a list"]
    seen = set()
    for index, task in enumerate(tasks):
        prefix = f"TASKS[{index}]"
        if not isinstance(task, dict):
            errors.append(f"{prefix} must be a dictionary")
            continue
        for field in FIELDS - task.keys():
            errors.append(f"{prefix} missing {field}")
        for field in ("id", "name", "icon"):
            if field in task and (not isinstance(task[field], str) or not task[field].strip()):
                errors.append(f"{prefix}.{field} must be a non-empty string")
        if "description" in task and not isinstance(task["description"], str):
            errors.append(f"{prefix}.description must be a string")
        if "id" in task and isinstance(task["id"], str):
            if task["id"] in seen:
                errors.append(f"{prefix}.id duplicates {task['id']}")
            seen.add(task["id"])
        if "category" in task and (not isinstance(task["category"], str) or task["category"] not in CATEGORIES):
            errors.append(f"{prefix}.category must be one of {', '.join(sorted(CATEGORIES))}")
        if "points" in task and (
            type(task["points"]) not in (int, float)
            or not math.isfinite(task["points"])
            or task["points"] <= 0
        ):
            errors.append(f"{prefix}.points must be a positive finite number")
    return errors


def generate(source=ROOT / "tasks.py", output=ROOT / "src/generated/tasks.json", check=False):
    spec = importlib.util.spec_from_file_location("task_definitions", source)
    if spec is None or spec.loader is None:
        raise ValueError("Cannot load tasks.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "TASKS"):
        raise ValueError("tasks.py must define TASKS")
    errors = validate(module.TASKS)
    if errors:
        raise ValueError("Invalid tasks.py:\n" + "\n".join(errors))
    data = json.dumps(module.TASKS, ensure_ascii=False, indent=2) + "\n"
    if check:
        if not output.exists() or output.read_text() != data:
            raise ValueError(f"{output} is missing or stale; run python scripts/generate_tasks.py")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(data)
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        generate(check=args.check)
    except (ValueError, OSError, SyntaxError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error
