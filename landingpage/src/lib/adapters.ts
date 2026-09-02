import { AgentNode, AgentProject, BaselineRun, CandidateSubstitution, EvalCase, EvalCaseInput, EvalGrader, EvalRun, EvalRunCase, EvalSuite, JsonObject, OptimizationCandidate, OptimizationRecommendation, OptimizationRun, OptimizerEvent, ProfileMetrics, ProfileRun, ProjectLayout, ProjectSettings, ProjectSetupState, TraceDetail, TraceSpan } from "../types";

const value = (item: unknown, key: string, fallback: unknown = undefined): unknown => item && typeof item === "object" && key in item ? (item as Record<string, unknown>)[key] : fallback;
const number = (item: unknown, keys: string[], fallback = 0) => {
  for (const key of keys) { const candidate = Number(value(item, key)); if (Number.isFinite(candidate)) return candidate; }
  return fallback;
};
const optionalNumber = (item: unknown, keys: string[]): number | undefined => {
  const parsed = number(item, keys, NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const text = (item: unknown, keys: string[], fallback = "") => { for (const key of keys) { const candidate = value(item, key); if (candidate !== undefined && candidate !== null) return String(candidate); } return fallback; };
const object = (item: unknown, keys: string[]): JsonObject => {
  for (const key of keys) {
    const candidate = value(item, key);
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate as JsonObject;
  }
  return {};
};

const optionalText = (item: unknown, keys: string[]): string | null | undefined => {
  for (const key of keys) {
    const candidate = value(item, key);
    if (candidate !== undefined && candidate !== null) return String(candidate);
  }
  return candidatePresent(item, keys) ? null : undefined;
};

const candidatePresent = (item: unknown, keys: string[]) => keys.some((key) => item && typeof item === "object" && key in item);

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

export function adaptProfileMetrics(item: unknown): ProfileMetrics {
  const metrics = object(item, ["metrics", "aggregateMetrics", "aggregate_metrics"]);
  const source = Object.keys(metrics).length ? metrics : object(item, []);
  return {
    ...source,
    runsObserved: number(source, ["runsObserved", "runs_observed"]), spans: number(source, ["spans"]),
    p50LatencyMs: number(source, ["p50LatencyMs", "p50_latency_ms"]), p95LatencyMs: number(source, ["p95LatencyMs", "p95_latency_ms"]),
    avgLatencyMs: number(source, ["avgLatencyMs", "avg_latency_ms"]), inputTokens: number(source, ["inputTokens", "input_tokens"]),
    outputTokens: number(source, ["outputTokens", "output_tokens"]), totalTokens: number(source, ["totalTokens", "total_tokens"]),
    totalCostUsd: number(source, ["totalCostUsd", "total_cost_usd"]), costPerRequestUsd: number(source, ["costPerRequestUsd", "cost_per_request_usd"]),
    avgCostPerCallUsd: number(source, ["avgCostPerCallUsd", "avg_cost_per_call_usd"]), errorCount: number(source, ["errorCount", "error_count"]),
    errorRatePct: number(source, ["errorRatePct", "error_rate_pct"]), byNode: object(source, ["byNode", "by_node"]), byModel: object(source, ["byModel", "by_model"]),
  };
}

export function adaptProfileRun(item: unknown): ProfileRun {
  return { runId: text(item, ["runId", "run_id", "id"]), projectId: optionalText(item, ["projectId", "project_id"] ) || undefined, status: text(item, ["status"], "QUEUED").toUpperCase(), metrics: Object.keys(object(item, ["metrics", "aggregateMetrics", "aggregate_metrics"])).length ? adaptProfileMetrics(item) : undefined, error: optionalText(item, ["error"]), createdAt: optionalText(item, ["createdAt", "created_at"]) || undefined, updatedAt: optionalText(item, ["updatedAt", "updated_at"]) || undefined, completedAt: optionalText(item, ["completedAt", "completed_at"]) };
}

export function adaptTraceSpan(item: unknown): TraceSpan {
  return { id: text(item, ["id", "spanId", "span_id"]), traceId: text(item, ["traceId", "trace_id"]), spanId: text(item, ["spanId", "span_id"]), parentSpanId: optionalText(item, ["parentSpanId", "parent_span_id"]), nodeId: optionalText(item, ["nodeId", "node_id"]), model: optionalText(item, ["model", "requestedModel", "requested_model"]), provider: optionalText(item, ["provider"]), startedAt: optionalText(item, ["startedAt", "started_at"]), endedAt: optionalText(item, ["endedAt", "ended_at"]), durationMs: number(item, ["durationMs", "duration_ms"]), inputTokens: number(item, ["inputTokens", "input_tokens"]), outputTokens: number(item, ["outputTokens", "output_tokens"]), cost: number(item, ["cost", "costUsd", "cost_usd"]), status: text(item, ["status"], "unset"), statusCode: optionalNumber(item, ["statusCode", "status_code"]) ?? null, statusMessage: optionalText(item, ["statusMessage", "status_message"]), receivedAt: optionalText(item, ["receivedAt", "received_at"]), serviceName: optionalText(item, ["serviceName", "service_name"]) };
}

export function adaptTraceDetail(item: unknown): TraceDetail {
  const spans = ((value(item, "spans", []) || []) as unknown[]).map(adaptTraceSpan);
  return { id: text(item, ["id", "traceId", "trace_id"]), traceId: text(item, ["traceId", "trace_id", "id"]), projectId: text(item, ["projectId", "project_id"]), spanCount: number(item, ["spanCount", "span_count"], spans.length), startedAt: optionalText(item, ["startedAt", "started_at"]), endedAt: optionalText(item, ["endedAt", "ended_at"]), durationMs: number(item, ["durationMs", "duration_ms"]), spans };
}

export function adaptEvalGrader(item: unknown): EvalGrader { return { name: text(item, ["name"]), kind: text(item, ["kind", "type"]), config: object(item, ["config"]) }; }
export function adaptEvalCaseInput(item: unknown): EvalCaseInput { return { id: text(item, ["id", "caseId", "case_id"]), ...(candidatePresent(item, ["input", "inputData", "input_data"]) ? { input: value(item, "input", value(item, "inputData", value(item, "input_data"))) as EvalCaseInput["input"] } : {}), ...(candidatePresent(item, ["expected"]) ? { expected: value(item, "expected") as EvalCaseInput["expected"] } : {}), metadata: object(item, ["metadata", "metadataJson", "metadata_json"]) }; }

export function adaptEvalSuite(item: unknown): EvalSuite {
  const cases = ((value(item, "cases", []) || []) as unknown[]).map(adaptEvalCaseInput);
  const graders = ((value(item, "graders", []) || []) as unknown[]).map(adaptEvalGrader);
  return { id: text(item, ["id", "suiteId", "suite_id"]), projectId: text(item, ["projectId", "project_id"]), organizationId: optionalText(item, ["organizationId", "organization_id"]) || undefined, name: text(item, ["name"], "Evaluation suite"), version: number(item, ["version"], 1), metadata: object(item, ["metadata", "metadataJson", "metadata_json"]), caseCount: number(item, ["caseCount", "case_count"], cases.length), graderCount: number(item, ["graderCount", "grader_count"], graders.length), ...(cases.length ? { cases } : {}), ...(graders.length ? { graders } : {}), createdAt: optionalText(item, ["createdAt", "created_at"]) || undefined, updatedAt: optionalText(item, ["updatedAt", "updated_at"]) || undefined };
}

export function adaptEvalRun(item: unknown): EvalRun {
  return { runId: text(item, ["runId", "run_id", "id"]), projectId: text(item, ["projectId", "project_id"]), evalSuiteId: text(item, ["evalSuiteId", "eval_suite_id", "datasetId", "dataset_id"]), projectVersionId: optionalText(item, ["projectVersionId", "project_version_id"]), status: text(item, ["status"], "QUEUED").toUpperCase(), candidateConfig: object(item, ["candidateConfig", "candidate_config"]), graderSnapshot: ((value(item, "graderSnapshot", value(item, "grader_snapshot", [])) || []) as unknown[]).map(adaptEvalGrader), metrics: adaptProfileMetrics(item), caseCount: number(item, ["caseCount", "case_count"]), completedCaseCount: number(item, ["completedCaseCount", "completed_case_count"]), error: optionalText(item, ["error"]), createdAt: optionalText(item, ["createdAt", "created_at"]) || undefined, updatedAt: optionalText(item, ["updatedAt", "updated_at"]) || undefined, startedAt: optionalText(item, ["startedAt", "started_at"]), completedAt: optionalText(item, ["completedAt", "completed_at"]) };
}

export function adaptEvalRunCase(item: unknown): EvalRunCase {
  const base = adaptEvalCase(item);
  return { ...base, ordinal: optionalNumber(item, ["ordinal"]), score: optionalNumber(item, ["score"] ) ?? null, latencyMs: optionalNumber(item, ["latencyMs", "latency_ms"]) ?? null, evidence: object(item, ["evidence"]) };
}

export function adaptBaselineRun(item: unknown): BaselineRun { return { runId: text(item, ["runId", "run_id", "id"]), projectId: optionalText(item, ["projectId", "project_id"]) || undefined, status: text(item, ["status"], "QUEUED").toUpperCase(), config: object(item, ["config"]), result: (value(item, "result") as JsonObject | null | undefined), error: optionalText(item, ["error"]), maxExperimentCostUsd: optionalNumber(item, ["maxExperimentCostUsd", "max_experiment_cost_usd"]) } }

export function adaptOptimizationRun(item: unknown): OptimizationRun { return { runId: text(item, ["runId", "run_id", "id"]), projectId: optionalText(item, ["projectId", "project_id"]) || undefined, status: text(item, ["status"], "QUEUED").toUpperCase(), config: object(item, ["config"]), candidates: ((value(item, "candidates", []) || []) as unknown[]).map(adaptCandidate), result: (value(item, "result") as JsonObject | null | undefined), error: optionalText(item, ["error"]), maxExperimentCostUsd: number(item, ["maxExperimentCostUsd", "max_experiment_cost_usd"], NaN) } }

export function adaptRecommendation(item: unknown): OptimizationRecommendation { return { ...object(item, []), candidateId: optionalText(item, ["candidateId", "candidate_id"]) || undefined, selected: Boolean(value(item, "selected", false)), nodeModels: (value(item, "nodeModels", value(item, "node_models", {})) || {}) as Record<string, string> }; }

export function adaptSettings(item: unknown): ProjectSettings { return { projectId: text(item, ["projectId", "project_id"]), qualityTolerancePp: number(item, ["qualityTolerancePp", "quality_tolerance_pp", "qualityTolerancePct", "quality_tolerance_pct"], 1), qualityTolerancePct: number(item, ["qualityTolerancePct", "quality_tolerance_pct", "qualityTolerancePp", "quality_tolerance_pp"], 1), confidencePct: number(item, ["confidencePct", "confidence_pct"], 95), maxP95LatencyMs: optionalNumber(item, ["maxP95LatencyMs", "max_p95_latency_ms"]) ?? null, objective: object(item, ["objective"]), allowedModels: ((value(item, "allowedModels", value(item, "allowed_models", [])) || []) as unknown[]).map(String), updatedAt: optionalText(item, ["updatedAt", "updated_at"]) } }

export function adaptLayout(item: unknown): ProjectLayout { return { projectId: optionalText(item, ["projectId", "project_id"]) || undefined, versionId: optionalText(item, ["versionId", "version_id"]), revision: number(item, ["revision"], 0), nodes: (value(item, "nodes", {}) || {}) as ProjectLayout["nodes"], updatedAt: optionalText(item, ["updatedAt", "updated_at"]) } }

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

const adaptSetup = (item: unknown, version: string, nodes: AgentNode[]): ProjectSetupState | undefined => {
  const raw = value(item, "setup", value(item, "setupState", undefined));
  const source = (raw && typeof raw === "object" ? raw : item) as Record<string, unknown>;
  const completed = (value(source, "completed", {}) || {}) as Record<string, unknown>;
  const counts = (value(source, "counts", {}) || {}) as Record<string, unknown>;
  const hasExplicit = ["hasVersion", "has_version", "hasTraces", "has_traces", "hasEvaluationSuite", "has_evaluation_suite", "nextAction", "next_action", "baselineStatus", "baseline_status", "completed", "counts", "stage"].some((key) => key in source);
  if (!hasExplicit && !raw) return undefined;
  const bool = (keys: string[], fallback: boolean) => { for (const key of keys) if (key in source) return Boolean(source[key]); for (const key of keys) if (key in completed) return Boolean(completed[key]); return fallback; };
  const status = text(source, ["baselineStatus", "baseline_status"], Boolean(completed.baseline) ? "COMPLETED" : "NOT_STARTED").toUpperCase();
  return {
    projectCreated: bool(["projectCreated", "project_created"], true),
    hasVersion: bool(["hasVersion", "has_version", "agentVersion", "agent_version"], Boolean(version && version !== "latest")),
    hasTraces: bool(["hasTraces", "has_traces", "traces"], false),
    hasEvaluationSuite: bool(["hasEvaluationSuite", "has_evaluation_suite", "hasEvals", "has_evals", "evaluations", "evalSuites", "eval_suites"], false),
    baselineStatus: status,
    nextAction: text(source, ["nextAction", "next_action"], nodes.length ? "ADD_EVALUATIONS" : "DEFINE_AGENT").toUpperCase(),
    profilingOnly: bool(["profilingOnly", "profiling_only"], false),
    versionId: text(source, ["versionId", "version_id"], version),
    traceCount: number(source, ["traceCount", "trace_count"], number(counts, ["traces"])),
    evalCaseCount: number(source, ["evalCaseCount", "eval_case_count"], number(counts, ["evalCases", "eval_case_count", "evaluations"])),
  };
};

export function adaptOnboarding(item: unknown): ProjectSetupState { return adaptSetup(item, "", []) || { projectCreated: true, hasVersion: false, hasTraces: false, hasEvaluationSuite: false, baselineStatus: "NOT_STARTED", nextAction: "DEFINE_AGENT" }; }

export function adaptProject(item: unknown): AgentProject {
  const nodes = ((value(item, "nodes", []) || []) as unknown[]).map(adaptNode);
  const edges = ((value(item, "edges", []) || []) as unknown[]).map((edge) => ({ id: text(edge, ["id"]), from: text(edge, ["from"]), to: text(edge, ["to"]), label: text(edge, ["label"]), throughputTokensPerSec: number(edge, ["throughputTokensPerSec", "throughput_tokens_per_sec"]), avgLatencyMs: number(edge, ["avgLatencyMs", "avg_latency_ms"]) }));
  const runId = text(item, ["runId", "run_id"], "");
  const version = text(item, ["version", "versionId", "version_id"], "");
  const setup = adaptSetup(item, version, nodes);
  return {
    id: text(item, ["id", "projectId", "project_id"]), name: text(item, ["name"], "Untitled agent"), environment: text(item, ["environment"], "STAGING"), version, slug: text(item, ["slug"], ""), runId,
    totalExecutions: number(item, ["totalExecutions", "total_executions"]), baselineCost: number(item, ["baselineCost", "baseline_cost"]), optimizedCost: number(item, ["optimizedCost", "optimized_cost"]), savingsPct: number(item, ["savingsPct", "savings_pct"]), monthlySavingsEstimate: number(item, ["monthlySavingsEstimate", "monthly_savings_estimate"]), monthlyRequests: number(item, ["monthlyRequests", "monthly_requests"]), baselineLatencyP95: number(item, ["baselineLatencyP95", "baseline_latency_p95"]), optimizedLatencyP95: number(item, ["optimizedLatencyP95", "optimized_latency_p95"]), baselineQuality: number(item, ["baselineQuality", "baseline_quality"]), optimizedQuality: number(item, ["optimizedQuality", "optimized_quality"]), evalCasesCount: number(item, ["evalCasesCount", "eval_cases_count"]), qualityTolerancePct: number(item, ["qualityTolerancePct", "qualityTolerancePp", "quality_tolerance_pp", "quality_tolerance_pct"]), confidencePct: number(item, ["confidencePct", "confidence_pct"], 95), nodes, edges, setup,
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
