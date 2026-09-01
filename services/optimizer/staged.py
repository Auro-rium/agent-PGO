"""Deterministic staged optimizer for candidate agent configurations."""

from dataclasses import dataclass, field
from typing import Callable, Iterable, Any


@dataclass(frozen=True)
class Candidate:
    id: str
    cost_usd: float
    latency_ms: float
    quality: float
    config: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.cost_usd < 0 or self.latency_ms < 0:
            raise ValueError("candidate cost and latency cannot be negative")


@dataclass(frozen=True)
class OptimizationStage:
    name: str
    candidate_ids: tuple[str, ...]
    budget: int


@dataclass(frozen=True)
class OptimizationResult:
    recommended: Candidate
    stages: tuple[OptimizationStage, ...]


class StagedOptimizer:
    def __init__(self, evaluate: Callable[[Candidate, int], float] | None = None) -> None:
        self.evaluate = evaluate or (lambda candidate, budget: candidate.quality)

    @staticmethod
    def _rank(candidates: Iterable[Candidate], scores: dict[str, float]) -> list[Candidate]:
        return sorted(candidates, key=lambda c: (-scores[c.id], c.cost_usd, c.latency_ms, c.id))

    def optimize(self, candidates: Iterable[Candidate], beam_width: int = 3, halving_rounds: int = 2, initial_budget: int = 1) -> OptimizationResult:
        pool = list(candidates)
        if not pool:
            raise ValueError("at least one candidate is required")
        if len({c.id for c in pool}) != len(pool):
            raise ValueError("candidate ids must be unique")
        if beam_width < 1 or halving_rounds < 1 or initial_budget < 1:
            raise ValueError("beam width, rounds, and budget must be positive")
        stages: list[OptimizationStage] = []
        sensitivity_scores = {c.id: float(self.evaluate(c, initial_budget)) for c in pool}
        ordered = self._rank(pool, sensitivity_scores)
        stages.append(OptimizationStage("sensitivity", tuple(c.id for c in ordered), initial_budget))
        beam = ordered[:beam_width]
        stages.append(OptimizationStage("beam", tuple(c.id for c in beam), initial_budget))
        budget = initial_budget
        for round_number in range(halving_rounds):
            budget *= 2
            scores = {c.id: float(self.evaluate(c, budget)) for c in beam}
            keep = max(1, (len(beam) + 1) // 2)
            beam = self._rank(beam, scores)[:keep]
            stages.append(OptimizationStage("successive_halving", tuple(c.id for c in beam), budget))
        final_scores = {c.id: float(self.evaluate(c, budget)) for c in beam}
        recommended = self._rank(beam, final_scores)[0]
        return OptimizationResult(recommended, tuple(stages))
