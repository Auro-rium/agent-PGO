"""Run the bounded Open Deep Research benchmark against AgentPGO role search.

Examples:
  python scripts/run_odr_benchmark.py --mode replay --tasks 20 --search-tasks 50
  python scripts/run_odr_benchmark.py --mode backboard --tasks 1 --model-pool backboard:gpt-luna-5.6

Replay is local and uses historical ODR reports. Backboard mode is live and
requires BACKBOARD_API_KEY in the ODR checkout .env.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.benchmark.open_deep_research import (  # noqa: E402
    DEFAULT_BASELINE, DEFAULT_MODEL_POOL, CallableNodeExecutor,
    load_odr_tasks, load_replay_executor, run_assignment, staged_search,
)
from services.worker.providers import BackboardExecutor, ProviderRequest  # noqa: E402


def _load_env(path: Path) -> None:
    if not path.exists(): return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        key, value = line.split("=", 1)
        import os
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("replay", "backboard"), default="replay")
    parser.add_argument("--odr-repo", type=Path, default=Path("/home/lenovo/Documents/open_deep_research"))
    parser.add_argument("--artifacts", type=Path, default=Path("/home/lenovo/Documents/open_deep_research/tests/expt_results"))
    parser.add_argument("--tasks", type=int, default=20)
    parser.add_argument("--search-tasks", type=int, default=50)
    parser.add_argument("--beam-width", type=int, default=8)
    parser.add_argument("--halving-rounds", type=int, default=2)
    parser.add_argument("--model-pool", nargs="+", default=list(DEFAULT_MODEL_POOL))
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "odr-benchmark.json")
    args = parser.parse_args()
    if args.tasks < 1 or args.search_tasks < args.tasks: parser.error("tasks must be positive and search-tasks >= tasks")
    tasks = load_odr_tasks(args.artifacts / "deep_research_bench_gpt-4.1.jsonl", limit=args.search_tasks)
    if args.mode == "replay":
        pool = tuple(args.model_pool)
        executor = load_replay_executor(args.artifacts, pool)
        result = staged_search(tasks, executor, DEFAULT_BASELINE, pool, early_tasks=args.tasks, search_tasks=args.search_tasks, beam_width=args.beam_width, halving_rounds=args.halving_rounds, replay=executor)
        payload = {"status": "completed", "mode": "replay", "evidence": "historical ODR report replay; proxy quality only", "model_pool": list(pool), **result}
    else:
        _load_env(args.odr_repo / ".env")
        import os
        key = os.getenv("BACKBOARD_API_KEY")
        if not key: raise SystemExit("blocked: BACKBOARD_API_KEY is not set in the ODR .env")
        pool = tuple(args.model_pool)
        if any(not model.startswith("backboard:") for model in pool): raise SystemExit("backboard mode requires a backboard-only --model-pool")
        provider = BackboardExecutor(api_key=key, base_url=os.getenv("BACKBOARD_BASE_URL"), llm_provider=os.getenv("BACKBOARD_LLM_PROVIDER", "openai"), timeout_seconds=60)
        def call(node: str, model: str, prompt: str):
            response = provider.execute(ProviderRequest(provider="backboard", model=model.split(":", 1)[-1], prompt=prompt, temperature=0.0))
            return response.text, response.latency_ms, response.input_tokens, response.output_tokens, None
        executor = CallableNodeExecutor(call)
        run = run_assignment(tasks[:args.tasks], DEFAULT_BASELINE | {node: pool[0] for node in DEFAULT_BASELINE}, executor, mode="live", evidence="live Backboard role pipeline")
        payload = {"status": "completed", "mode": "backboard", "evidence": "actual Backboard requests through four ODR roles", "model_pool": list(pool), "baseline": run}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    def encode(v):
        from dataclasses import asdict, is_dataclass
        if is_dataclass(v): return {k: encode(x) for k, x in asdict(v).items()}
        if isinstance(v, tuple): return [encode(x) for x in v]
        if isinstance(v, dict): return {k: encode(x) for k, x in v.items()}
        return v
    args.output.write_text(json.dumps(encode(payload), indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"status": payload["status"], "mode": args.mode, "output": str(args.output), "tasks": args.tasks}, indent=2))
    return 0

if __name__ == "__main__": raise SystemExit(main())
