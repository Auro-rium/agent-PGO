"""Pareto frontier and deterministic recommendation selection."""

from collections.abc import Iterable

from .staged import Candidate


def _dominates(left: Candidate, right: Candidate) -> bool:
    no_worse = left.cost_usd <= right.cost_usd and left.latency_ms <= right.latency_ms and left.quality >= right.quality
    strictly_better = left.cost_usd < right.cost_usd or left.latency_ms < right.latency_ms or left.quality > right.quality
    return no_worse and strictly_better


def pareto_frontier(candidates: Iterable[Candidate]) -> list[Candidate]:
    pool = list(candidates)
    return [candidate for candidate in pool if not any(_dominates(other, candidate) for other in pool if other.id != candidate.id)]


def recommend(candidates: Iterable[Candidate], quality_weight: float = 1.0, cost_weight: float = 0.1, latency_weight: float = 0.001) -> Candidate:
    pool = list(candidates)
    if not pool:
        raise ValueError("at least one candidate is required")
    # Scores are intentionally explicit and stable; consumers can provide
    # weights appropriate to their budget/latency envelope.
    return max(pool, key=lambda c: (quality_weight * c.quality - cost_weight * c.cost_usd - latency_weight * c.latency_ms, c.quality, -c.cost_usd, -c.latency_ms, c.id))
