import { AgentNode, AgentProject, CandidateSubstitution, EvalCase, OptimizationCandidate, OptimizerEvent } from "../types";

const value = (item: unknown, key: string, fallback: unknown = undefined): unknown => item && typeof item === "object" && key in item ? (item as Record<string, unknown>)[key] : fallback;
const number = (item: unknown, keys: string[], fallback = 0) => {
  for (const key of keys) { const candidate = Number(value(item, key)); if (Number.isFinite(candidate)) return candidate; }
  return fallback;
};
const text = (item: unknown, keys: string[], fallback = "") => { for (const key of keys) { const candidate = value(item, key); if (candidate !== undefined && candidate !== null) return String(candidate); } return fallback; };

export const modelLabel = (model: string) => {
  const clean = model.split("/").pop() || model;
  return clean.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export function adaptCandidate(item: unknown): OptimizationCandidate {
  const nodeModels = (value(item, "nodeModels", value(item, "node_models", {})) || {}) as Record<string, string>;
  return {
    id: text(item, ["id", "candidateId", "candidate_id"], crypto.randomUUID()), name: text(item, ["name"], "Candidate"),
    costPerReq: number(item, ["costPerReq", "cost_per_req", "cost" ]), qualityPct: number(item, ["qualityPct", "quality_pct", "quality"]),
    latencySec: number(item, ["latencySec", "latency_sec", "latency"]), p95LatencySec: number(item, ["p95LatencySec", "p95_latency_sec", "p95Latency"]),
    savingsPct: number(item, ["savingsPct", "savings_pct"]), nodeModels, isCheapest: Boolean(value(item, "isCheapest", value(item, "is_cheapest"))),
    isBalanced: Boolean(value(item, "isBalanced", value(item, "is_balanced"))), isHighestQuality: Boolean(value(item, "isHighestQuality", value(item, "is_highest_quality"))),
    isBaseline: Boolean(value(item, "isBaseline", value(item, "is_baseline"))), isParetoOptimal: Boolean(value(item, "isParetoOptimal", value(item, "is_pareto_optimal", false))),
    evalPassRate: number(item, ["evalPassRate", "eval_pass_rate", "passRate"]), evalCount: number(item, ["evalCount", "eval_count"]),
  };
}

export function adaptNode(item: unknown): AgentNode {
  const candidates = (value(item, "candidates", []) || []) as unknown[];
  const baseline = text(item, ["baselineModel", "baseline_model", "model"], "unknown/unknown");
  return {
    id: text(item, ["id", "nodeId", "node_id"]), name: text(item, ["name"], "Node"), role: text(item, ["role"], "Agent node"),
    x: number(item, ["x"]), y: number(item, ["y"]), baselineModel: baseline,
    currentModel: text(item, ["currentModel", "current_model"], baseline), optimizedModel: text(item, ["optimizedModel", "optimized_model"], baseline),
    calls: number(item, ["calls"]), avgCost: number(item, ["avgCost", "avg_cost"]), baselineCost: number(item, ["baselineCost", "baseline_cost"]), optimizedCost: number(item, ["optimizedCost", "optimized_cost"]),
    latencySec: number(item, ["latencySec", "latency_sec"]), baselineLatencySec: number(item, ["baselineLatencySec", "baseline_latency_sec"]), optimizedLatencySec: number(item, ["optimizedLatencySec", "optimized_latency_sec"]),
    inputTokens: number(item, ["inputTokens", "input_tokens"]), outputTokens: number(item, ["outputTokens", "output_tokens"]), costSharePct: number(item, ["costSharePct", "cost_share_pct"]),
    qualitySensitivity: (text(item, ["qualitySensitivity", "quality_sensitivity"], "MEDIUM").toUpperCase() as AgentNode["qualitySensitivity"]), isHotspot: Boolean(value(item, "isHotspot", value(item, "is_hotspot"))),
    promptTemplate: text(item, ["promptTemplate", "prompt_template"], ""), candidates: candidates.map((candidate) => adaptSubstitution(candidate)),
  };
}

const adaptSubstitution = (item: unknown): CandidateSubstitution => ({
  model: text(item, ["model", "modelId", "model_id"]), costDelta: number(item, ["costDelta", "cost_delta"]), costDeltaPct: number(item, ["costDeltaPct", "cost_delta_pct"]), qualityDelta: number(item, ["qualityDelta", "quality_delta"]), latencyDeltaSec: number(item, ["latencyDeltaSec", "latency_delta_sec"]), status: text(item, ["status"], "VIABLE").toUpperCase() as CandidateSubstitution["status"], reason: text(item, ["reason"], "Measured against the stored baseline."),
});

export function adaptProject(item: unknown): AgentProject {
  const nodes = ((value(item, "nodes", []) || []) as unknown[]).map(adaptNode);
  const edges = ((value(item, "edges", []) || []) as unknown[]).map((edge) => ({ id: text(edge, ["id"]), from: text(edge, ["from"]), to: text(edge, ["to"]), label: text(edge, ["label"]), throughputTokensPerSec: number(edge, ["throughputTokensPerSec", "throughput_tokens_per_sec"]), avgLatencyMs: number(edge, ["avgLatencyMs", "avg_latency_ms"]) }));
  const runId = text(item, ["runId", "run_id"], "");
  return {
    id: text(item, ["id", "projectId", "project_id"]), name: text(item, ["name"], "Untitled agent"), environment: text(item, ["environment"], "STAGING"), version: text(item, ["version", "versionId", "version_id"], "latest"), runId,
    totalExecutions: number(item, ["totalExecutions", "total_executions"]), baselineCost: number(item, ["baselineCost", "baseline_cost"]), optimizedCost: number(item, ["optimizedCost", "optimized_cost"]), savingsPct: number(item, ["savingsPct", "savings_pct"]), monthlySavingsEstimate: number(item, ["monthlySavingsEstimate", "monthly_savings_estimate"]), monthlyRequests: number(item, ["monthlyRequests", "monthly_requests"]), baselineLatencyP95: number(item, ["baselineLatencyP95", "baseline_latency_p95"]), optimizedLatencyP95: number(item, ["optimizedLatencyP95", "optimized_latency_p95"]), baselineQuality: number(item, ["baselineQuality", "baseline_quality"]), optimizedQuality: number(item, ["optimizedQuality", "optimized_quality"]), evalCasesCount: number(item, ["evalCasesCount", "eval_cases_count"]), qualityTolerancePct: number(item, ["qualityTolerancePct", "qualityTolerancePp", "quality_tolerance_pp", "quality_tolerance_pct"]), confidencePct: number(item, ["confidencePct", "confidence_pct"], 95), nodes, edges,
  };
}

export function adaptOptimizerEvent(item: unknown): OptimizerEvent {
  const type = text(item, ["type", "eventType", "event_type"], "INFO").toUpperCase();
  return { id: text(item, ["id", "eventId", "event_id"], crypto.randomUUID()), timestamp: text(item, ["timestamp", "createdAt", "created_at"], new Date().toISOString()), nodeId: text(item, ["nodeId", "node_id"]), nodeName: text(item, ["nodeName", "node_name"]), fromModel: text(item, ["fromModel", "from_model"]), toModel: text(item, ["toModel", "to_model"]), type: (type as OptimizerEvent["type"]), costChangePct: number(item, ["costChangePct", "cost_change_pct"], NaN), qualityDeltaPp: number(item, ["qualityDeltaPp", "quality_delta_pp"], NaN), costPerReq: number(item, ["costPerReq", "cost_per_req"], NaN), qualityPct: number(item, ["qualityPct", "quality_pct"], NaN), message: text(item, ["message"], "Optimizer event") };
}

export function adaptEvalCase(item: unknown): EvalCase {
  const prompt = text(item, ["prompt", "input", "inputData", "input_data"], "[Prompt content not retained]");
  return { id: text(item, ["id", "caseId", "case_id"]), category: text(item, ["category"], "Uncategorized"), prompt, baselineScore: number(item, ["baselineScore", "baseline_score"]), optimizedScore: number(item, ["optimizedScore", "optimized_score"]), baselineLatencyMs: number(item, ["baselineLatencyMs", "baseline_latency_ms"]), optimizedLatencyMs: number(item, ["optimizedLatencyMs", "optimized_latency_ms"]), status: text(item, ["status"], "WARN").toUpperCase() as EvalCase["status"], passed: Boolean(value(item, "passed", false)), diffNote: text(item, ["diffNote", "diff_note"], "No retained diff note." ) };
}
