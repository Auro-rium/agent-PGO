"""Statistical acceptance gate for candidate-vs-baseline quality samples."""

from dataclasses import dataclass
from math import erf, sqrt
from statistics import mean, pstdev
from typing import Sequence


@dataclass(frozen=True)
class GateResult:
    accepted: bool
    mean_delta: float
    p_value: float
    reason: str
    confidence_interval: tuple[float, float] = (-1.0, 1.0)


@dataclass(frozen=True)
class StatisticalGate:
    min_quality_delta: float = 0.0
    alpha: float = 0.05
    min_samples_for_significance: int = 5
    max_quality_regression: float = 0.0

    def __post_init__(self) -> None:
        if not 0 < self.alpha < 1 or self.min_quality_delta < 0 or self.max_quality_regression < 0 or self.min_samples_for_significance < 2:
            raise ValueError("invalid statistical gate settings")

    def test(self, baseline: Sequence[float], candidate: Sequence[float]) -> GateResult:
        if len(baseline) != len(candidate) or not baseline:
            raise ValueError("baseline and candidate must contain paired, non-empty samples")
        deltas = [float(c) - float(b) for b, c in zip(baseline, candidate)]
        delta = mean(deltas)
        sd = pstdev(deltas)
        if len(deltas) < self.min_samples_for_significance or sd == 0:
            p_value = 0.0 if delta >= self.min_quality_delta and (delta >= 0 or self.max_quality_regression > 0) else 1.0
            confidence_interval = (delta, delta)
        else:
            standard_error = sd / sqrt(len(deltas))
            z = delta / standard_error
            p_value = 0.5 * (1.0 - erf(z / sqrt(2.0)))  # one-sided normal approximation
            margin = 1.96 * standard_error
            confidence_interval = (delta - margin, delta + margin)
        threshold = self.min_quality_delta if self.min_quality_delta > 0 else -self.max_quality_regression
        lower_bound = confidence_interval[0]
        significance_ok = p_value <= self.alpha if self.min_quality_delta > 0 else True
        accepted = delta >= threshold and lower_bound >= -self.max_quality_regression and significance_ok
        reason = "quality change is within tolerance" if accepted else "quality gate not met"
        return GateResult(accepted, delta, p_value, reason, confidence_interval)

    def accept(self, baseline: Sequence[float], candidate: Sequence[float]) -> bool:
        return self.test(baseline, candidate).accepted
