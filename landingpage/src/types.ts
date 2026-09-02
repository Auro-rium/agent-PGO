export type NodeQualitySensitivity = 'HIGH' | 'MEDIUM' | 'LOW';

export type ProjectNextAction = 'DEFINE_AGENT' | 'CREATE_VERSION' | 'ADD_TRACES' | 'ADD_EVALUATIONS' | 'RUN_BASELINE' | 'OPTIMIZE' | 'PROFILING_ONLY';

export interface ProjectSetupState {
  projectCreated: boolean;
  hasVersion: boolean;
  hasTraces: boolean;
  hasEvaluationSuite: boolean;
  baselineStatus: 'NOT_STARTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | string;
  nextAction: ProjectNextAction | string;
  profilingOnly?: boolean;
  versionId?: string;
  traceCount?: number;
  evalCaseCount?: number;
}

export interface CandidateSubstitution {
  model: string;
  costDelta: number; // e.g. -0.091
  costDeltaPct: number; // e.g. -71.2
  qualityDelta: number; // in percentage points, e.g. -0.8
  latencyDeltaSec: number; // e.g. -4.2
  status: 'RECOMMENDED' | 'VIABLE' | 'REJECTED' | 'BASELINE';
  reason: string;
}

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  baselineModel: string;
  currentModel: string;
  optimizedModel: string;
  calls: number;
  avgCost: number; // e.g. 0.143
  baselineCost: number;
  optimizedCost: number;
  latencySec: number;
  baselineLatencySec: number;
  optimizedLatencySec: number;
  inputTokens: number;
  outputTokens: number;
  costSharePct: number; // e.g. 37.4%
  qualitySensitivity: NodeQualitySensitivity;
  isHotspot: boolean;
  promptTemplate?: string;
  candidates: CandidateSubstitution[];
  // Testing state during optimization
  testingState?: {
    status: 'IDLE' | 'TESTING' | 'ACCEPTED' | 'REJECTED';
    candidateModel?: string;
    measuredQuality?: number;
    measuredCost?: number;
    costChangePct?: number;
    qualityDeltaPp?: number;
  };
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  throughputTokensPerSec: number;
  avgLatencyMs: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface ProjectLayout {
  [key: string]: unknown;
  projectId?: string;
  versionId?: string | null;
  revision: number;
  nodes: Record<string, NodePosition>;
  updatedAt?: string | null;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ApiPage {
  nextCursor: string | null;
}

export interface ApiCollection<T> {
  data: T[];
  page: ApiPage;
}

export interface ProfileMetrics {
  runsObserved?: number;
  spans?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  avgLatencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCostUsd?: number;
  costPerRequestUsd?: number;
  avgCostPerCallUsd?: number;
  errorCount?: number;
  errorRatePct?: number;
  byNode?: Record<string, JsonValue>;
  byModel?: Record<string, JsonValue>;
  [key: string]: JsonValue | undefined;
}

export type RunStatus = 'QUEUED' | 'RUNNING' | 'PROFILING' | 'BASELINING' | 'SEARCHING' | 'VERIFYING' | 'COMPLETED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'FAILED' | 'PARTIAL' | string;

export interface ProfileRun {
  runId: string;
  projectId?: string;
  status: RunStatus;
  metrics?: ProfileMetrics;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export interface TraceSpan {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  nodeId?: string | null;
  model?: string | null;
  provider?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  status: string;
  statusCode?: number | null;
  statusMessage?: string | null;
  receivedAt?: string | null;
  serviceName?: string | null;
}

export interface TraceDetail {
  id: string;
  traceId: string;
  projectId: string;
  spanCount: number;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs: number;
  spans: TraceSpan[];
}

export interface EvalGrader {
  name: string;
  kind: string;
  config: JsonObject;
}

export interface EvalCaseInput {
  id: string;
  input?: JsonValue;
  expected?: JsonValue;
  metadata?: JsonObject;
}

export interface EvalSuite {
  id: string;
  projectId: string;
  organizationId?: string;
  name: string;
  version: number;
  metadata: JsonObject;
  caseCount: number;
  graderCount: number;
  cases?: EvalCaseInput[];
  graders?: EvalGrader[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EvalSuiteCreateInput {
  name: string;
  cases: JsonObject[];
  graders: JsonObject[];
  metadata?: JsonObject;
}

export interface EvalRun {
  runId: string;
  projectId: string;
  evalSuiteId: string;
  projectVersionId?: string | null;
  status: RunStatus;
  candidateConfig: JsonObject;
  graderSnapshot: EvalGrader[];
  metrics: ProfileMetrics;
  caseCount: number;
  completedCaseCount: number;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface EvalRunCase extends EvalCase {
  ordinal?: number;
  score?: number | null;
  latencyMs?: number | null;
  evidence?: JsonObject;
}

export interface BaselineRun {
  runId: string;
  projectId?: string;
  status: RunStatus;
  config: JsonObject;
  result?: JsonObject | null;
  error?: string | null;
  maxExperimentCostUsd?: number;
}

export interface OptimizationRun {
  runId: string;
  projectId?: string;
  status: RunStatus;
  config: JsonObject;
  candidates?: OptimizationCandidate[];
  result?: JsonObject | null;
  error?: string | null;
  maxExperimentCostUsd?: number;
}

export interface OptimizationRecommendation {
  candidateId?: string;
  selected?: boolean;
  nodeModels?: Record<string, string>;
  [key: string]: JsonValue | undefined;
}

export interface ProjectSettings {
  projectId: string;
  qualityTolerancePp: number;
  qualityTolerancePct: number;
  confidencePct: number;
  maxP95LatencyMs?: number | null;
  objective: JsonObject;
  allowedModels: string[];
  updatedAt?: string | null;
}

export interface OptimizationCandidate {
  id: string;
  name: string;
  costPerReq: number;
  qualityPct: number;
  latencySec: number;
  p95LatencySec: number;
  savingsPct: number;
  nodeModels: Record<string, string>; // nodeId -> modelName
  isCheapest?: boolean;
  isBalanced?: boolean;
  isHighestQuality?: boolean;
  isBaseline?: boolean;
  isParetoOptimal: boolean;
  evalPassRate: number; // e.g. 98.3
  evalCount: number;
}

export interface OptimizerEvent {
  id: string;
  timestamp: string; // e.g. '00:12.417'
  nodeId?: string;
  nodeName?: string;
  fromModel?: string;
  toModel?: string;
  type: 'BASELINE' | 'TESTING' | 'PASS' | 'REJECT' | 'FRONTIER' | 'SELECTED' | 'INFO';
  costChangePct?: number;
  qualityDeltaPp?: number;
  costPerReq?: number;
  qualityPct?: number;
  message: string;
}

export interface EvalCase {
  id: string;
  category: string;
  prompt?: string;
  baselineScore: number;
  optimizedScore: number;
  baselineLatencyMs: number;
  optimizedLatencyMs: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  passed: boolean;
  diffNote: string;
}

export interface AgentProject {
  id: string;
  name: string;
  slug?: string;
  environment: string; // 'PROD' | 'STAGING'
  version: string; // 'v31'
  runId: string; // 'RUN 1842'
  totalExecutions: number;
  baselineCost: number; // 0.382
  optimizedCost: number; // 0.141
  savingsPct: number; // 63.1
  monthlySavingsEstimate: number; // 4820
  monthlyRequests: number; // 35000
  baselineLatencyP95: number; // 24.1
  optimizedLatencyP95: number; // 15.8
  baselineQuality: number; // 92.4
  optimizedQuality: number; // 92.7
  evalCasesCount: number; // 120
  qualityTolerancePct: number; // 1.0
  confidencePct: number; // 95
  nodes: AgentNode[];
  edges: GraphEdge[];
  setup?: ProjectSetupState;
}

export type ViewMode = 'graph' | 'frontier' | 'timeline' | 'diff' | 'evals' | 'settings';
