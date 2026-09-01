"""Export a recommendation as portable, deterministic YAML."""

from typing import Any

from .staged import Candidate


def export_yaml(candidate: Candidate, *, include_metrics: bool = True) -> str:
    try:
        import yaml
        payload: dict[str, Any] = {"id": candidate.id, "config": candidate.config}
        if include_metrics:
            payload["metrics"] = {"quality": candidate.quality, "cost_usd": candidate.cost_usd, "latency_ms": candidate.latency_ms}
        return yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)
    except ImportError:
        # Keep the domain usable in a minimal worker image without PyYAML.
        lines = [f"id: {candidate.id}", "config:"]
        if candidate.config:
            lines.extend(f"  {key}: {value}" for key, value in candidate.config.items())
        else:
            lines.append("  {}")
        if include_metrics:
            lines.extend(["metrics:", f"  quality: {candidate.quality}", f"  cost_usd: {candidate.cost_usd}", f"  latency_ms: {candidate.latency_ms}"])
        return "\n".join(lines) + "\n"
