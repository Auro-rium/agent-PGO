import React, { useState } from 'react';
import { AgentProject } from '../types';
import { 
  X, 
  Copy, 
  Check, 
  Download
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: AgentProject;
  onExport?: () => Promise<Blob | void>;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, project, onExport }) => {
  const [activeTab, setActiveTab] = useState<'python' | 'json' | 'yaml' | 'langgraph'>('python');
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  if (!isOpen) return null;

  const manifest = {
    schemaVersion: 'agentpgo/v1',
    projectId: project.id,
    projectName: project.name,
    environment: project.environment,
    version: project.version,
    metrics: {
      baselineCostPerRequest: project.baselineCost,
      optimizedCostPerRequest: project.optimizedCost,
      savingsPct: project.savingsPct,
      baselineLatencyP95: project.baselineLatencyP95,
      optimizedLatencyP95: project.optimizedLatencyP95,
      baselineQuality: project.baselineQuality,
      optimizedQuality: project.optimizedQuality,
    },
    verification: {
      evalCases: project.evalCasesCount,
      qualityTolerancePp: project.qualityTolerancePct,
      confidencePct: project.confidencePct,
      runId: project.runId,
    },
    nodes: project.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      baselineModel: node.baselineModel,
      optimizedModel: node.optimizedModel,
      qualitySensitivity: node.qualitySensitivity,
    })),
  };

  const getExportCode = () => {
    if (activeTab === 'python') {
      return `# Generated from the persisted AgentPGO project configuration\n# Project: ${project.name} · Version: ${project.version}\n\nagentpgo_manifest = ${JSON.stringify(manifest, null, 2)}\n`;
    }

    if (activeTab === 'json') return JSON.stringify(manifest, null, 2);

    if (activeTab === 'yaml') {
      return `schemaVersion: "${manifest.schemaVersion}"
projectId: "${manifest.projectId}"
project: "${manifest.projectName}"
environment: "${manifest.environment}"
version: "${manifest.version}"
metrics:
  baselineCostPerRequest: ${manifest.metrics.baselineCostPerRequest}
  optimizedCostPerRequest: ${manifest.metrics.optimizedCostPerRequest}
  savingsPct: ${manifest.metrics.savingsPct}
  baselineLatencyP95: ${manifest.metrics.baselineLatencyP95}
  optimizedLatencyP95: ${manifest.metrics.optimizedLatencyP95}
  baselineQuality: ${manifest.metrics.baselineQuality}
  optimizedQuality: ${manifest.metrics.optimizedQuality}
nodes:
${manifest.nodes.map((node) => `  - id: "${node.id}"\n    name: "${node.name}"\n    baselineModel: "${node.baselineModel}"\n    optimizedModel: "${node.optimizedModel}"\n    qualitySensitivity: "${node.qualitySensitivity}"`).join('\n')}
verification:
  evalCases: ${manifest.verification.evalCases}
  qualityTolerancePp: ${manifest.verification.qualityTolerancePp}
  confidencePct: ${manifest.verification.confidencePct}
  runId: "${manifest.verification.runId}"
`;
    }

    const nodeModels = Object.fromEntries(manifest.nodes.map((node) => [node.id, node.optimizedModel]));
    return `# Framework-neutral AgentPGO model assignment\n# Attach these assignments in your agent framework after reviewing the server export.\n\nnode_models = ${JSON.stringify(nodeModels, null, 2)}\nproject_id = ${JSON.stringify(project.id)}\nversion = ${JSON.stringify(project.version)}\n`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getExportCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleServerExport = async () => {
    if (!onExport) return;
    setExporting(true);
    setExportError('');
    try {
      const blob = await onExport();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-agentpgo-export.yaml`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed.');
    } finally { setExporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="w-full max-w-2xl bg-[#090A0B] border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden z-10 font-mono text-xs flex flex-col">
        {/* Header */}
        <div className="p-3.5 border-b border-white/[0.05] flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[#D7DADD]" />
            <span className="font-semibold text-xs text-[#F2F3F4] tracking-wide uppercase">
              EXPORT AGENTPGO PROJECT MANIFEST
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#5C6268] hover:text-[#D7DADD] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Switcher */}
        <div className="flex items-center border-b border-white/[0.05] bg-[#090A0B] px-3">
          {(['python', 'json', 'yaml', 'langgraph'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-3 border-b-2 transition-colors text-xs uppercase font-medium ${
                activeTab === tab
                  ? 'border-[#D7DADD] text-[#F2F3F4]'
                  : 'border-transparent text-[#5C6268] hover:text-[#D7DADD]'
              }`}
            >
              {tab === 'python' ? 'Python SDK' : tab === 'json' ? 'JSON Manifest' : tab === 'yaml' ? 'YAML Spec' : 'LangGraph'}
            </button>
          ))}
        </div>

        {/* Code Content */}
        <div className="p-4 bg-[#050505] flex-1 overflow-y-auto max-h-96">
          <pre className="text-[11px] text-[#D7DADD] font-mono leading-relaxed selection:bg-white/[0.1]">
            {getExportCode()}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.05] bg-[#050505] flex items-center justify-between">
          <span className="text-[#5C6268] text-[10px]">
            Target: {project.name} · {project.savingsPct.toFixed(1)}% measured cost change
          </span>
          <div className="flex items-center gap-2">
          {onExport && <button onClick={handleServerExport} disabled={exporting} className="px-3.5 py-1.5 rounded bg-[#0F1113] border border-white/[0.08] text-[#D7DADD] disabled:opacity-50">{exporting ? 'Exporting…' : 'Download verified export'}</button>}
          <button
            onClick={handleCopy}
            className="px-3.5 py-1.5 rounded silver-btn-gradient text-[#050505] font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Manifest</span>
              </>
            )}
          </button>
          </div>
        </div>
        {exportError && <div className="px-3 pb-3 text-[10px] text-[#D7DADD]" role="alert">{exportError}</div>}
      </div>
    </div>
  );
};
