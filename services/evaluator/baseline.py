"""Baseline evaluation and aggregate metrics."""

from dataclasses import dataclass
from statistics import mean, quantiles
from typing import Any, Callable

from .datasets import EvalDataset, EvalExample
from services.optimizer.staged import Candidate


@dataclass(frozen=True)
class BaselineMetrics:
    success_rate: float
    mean_cost_usd: float
    mean_latency_ms: float
    sample_count: int
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0

    @property
    def quality(self) -> float:
        return self.success_rate


class BaselineRunner:
    def __init__(self, execute: Callable[[EvalExample, Candidate], Any]) -> None:
        self.execute = execute

    def run(self, dataset: EvalDataset, candidate: Candidate) -> BaselineMetrics:
        if not dataset.examples:
            raise ValueError("cannot evaluate an empty dataset")
        outcomes = [self.execute(example, candidate) for example in dataset.examples]
        successes = [self._value(o, "success", self._value(o, "output", None) == example.expected) for o, example in zip(outcomes, dataset.examples)]
        costs = [float(self._value(o, "cost_usd", 0.0)) for o in outcomes]
        latencies = [float(self._value(o, "latency_ms", 0.0)) for o in outcomes]
        p50 = quantiles(latencies, n=2, method="inclusive")[0] if len(latencies) >= 2 else latencies[0]
        p95 = quantiles(latencies, n=20, method="inclusive")[18] if len(latencies) >= 2 else latencies[0]
        return BaselineMetrics(mean(float(x) for x in successes), mean(costs), mean(latencies), len(outcomes), p50, p95)

    @staticmethod
    def _value(value: Any, key: str, default: Any) -> Any:
        return value.get(key, default) if isinstance(value, dict) else default
