"""Compatibility entry point; editable cases live only in root deepseek-eval.py."""

import runpy
from pathlib import Path

from eval_harness import main


if __name__ == "__main__":
    cases = runpy.run_path(str(Path(__file__).resolve().parent.parent / "deepseek-eval.py"))["CASES"]
    raise SystemExit(main(cases))
