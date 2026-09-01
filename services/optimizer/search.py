"""Node substitution and bounded beam search for model assignments."""
from dataclasses import dataclass
from typing import Any, Callable, Iterable

@dataclass(frozen=True)
class AssignmentCandidate:
    config: dict[str, str]
    quality: float
    cost_usd: float
    latency_ms: float

    @property
    def quality_delta(self) -> float:
        return self.quality


def search_assignments(
    baseline: dict[str, str],
    models: Iterable[str],
    evaluate: Callable[[dict[str, str]], AssignmentCandidate],
    *,
    beam_width: int = 8,
    max_quality_regression: float = 0.01,
) -> tuple[AssignmentCandidate, ...]:
    """Evaluate one-node substitutions, then bounded combinations.

    ``evaluate`` is injected so workers can run real providers while tests stay
    deterministic. Candidates are ranked by quality first, then cost/latency.
    """
    if not baseline or beam_width < 1 or max_quality_regression < 0:
        raise ValueError("baseline, beam_width, and tolerance are invalid")
    base = evaluate(dict(baseline))
    beam: list[AssignmentCandidate] = [base]
    for node in baseline:
        substitutions = []
        for model in models:
            if model == baseline[node]:
                continue
            config = dict(baseline); config[node] = model
            candidate = evaluate(config)
            if candidate.quality >= base.quality - max_quality_regression:
                substitutions.append(candidate)
        pool = beam + substitutions
        beam = sorted(pool, key=lambda c: (-c.quality, c.cost_usd, c.latency_ms, sorted(c.config.items())))[:beam_width]
        # Continue combinations from the surviving beam for the next node.
        next_pool = list(beam)
        for previous in beam:
            for model in models:
                if model == previous.config[node]:
                    continue
                config = dict(previous.config); config[node] = model
                candidate = evaluate(config)
                if candidate.quality >= base.quality - max_quality_regression:
                    next_pool.append(candidate)
        beam = sorted(next_pool, key=lambda c: (-c.quality, c.cost_usd, c.latency_ms, sorted(c.config.items())))[:beam_width]
    return tuple(beam)
