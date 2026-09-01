import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Check, 
  Copy
} from 'lucide-react';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntegrationsModal: React.FC<IntegrationsModalProps> = ({ isOpen, onClose }) => {
  const [activeFramework, setActiveFramework] = useState<'python' | 'ts' | 'langgraph' | 'crewai'>('python');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const frameworks = [
    { id: 'python', name: 'Python SDK (@agent_pgo)' },
    { id: 'ts', name: 'TypeScript / Node.js' },
    { id: 'langgraph', name: 'LangGraph' },
    { id: 'crewai', name: 'CrewAI / AutoGen' }
  ];

  const getIntegrationSnippet = () => {
    switch (activeFramework) {
      case 'python':
        return `# 1. Install twinerun SDK
pip install agent-pgo

# 2. Instrument your Agent execution function
import os
from agent_pgo import twinerun

pgo = twinerun(api_key=os.getenv("TWINERUN_API_KEY"))

# Wrap graph or individual sub-agent calls
@pgo.profile(agent_id="research-agent")
async def execute_agent(query: str):
    # Step 1: Planner
    planner_result = await pgo.call("planner", prompt=query)
    
    # Step 2: Researcher
    research_result = await pgo.call("researcher", context=planner_result)
    
    return research_result
`;
      case 'ts':
        return `// 1. Install twinerun package
npm i @twinerun/sdk

import { twinerun } from '@twinerun/sdk';

const pgo = new twinerun({ apiKey: process.env.TWINERUN_API_KEY });

// Execute with automated PGO routing
export async function runResearchAgent(query: string) {
  const session = pgo.startSession('research-agent');
  
  const plan = await session.executeNode('planner', { query });
  const raw = await session.executeNode('researcher', { plan });
  const facts = await session.executeNode('extractor', { raw });
  const reason = await session.executeNode('reasoner', { facts });
  
  return session.executeNode('formatter', { reason });
}
`;
      case 'langgraph':
        return `# LangGraph Runtime Telemetry & PGO Optimization Hook
from langgraph.graph import StateGraph
from agent_pgo.langgraph import PGOGraphWrapper

builder = StateGraph(State)
builder.add_node("planner", planner_node)
builder.add_node("researcher", researcher_node)
builder.add_node("reasoner", reasoner_node)

# Wrap with dynamic profile-guided optimizer
graph = builder.compile()
pgo_graph = PGOGraphWrapper(graph, agent_id="research-agent")
`;
      case 'crewai':
        return `# CrewAI Agent Telemetry Hook
from crewai import Agent, Crew, Process
from agent_pgo.crewai import patch_crew_pgo

planner_agent = Agent(role="Planner", goal="...", backstory="...")
researcher_agent = Agent(role="Researcher", goal="...", backstory="...")

crew = Crew(agents=[planner_agent, researcher_agent], process=Process.sequential)

# Wrap Crew with twinerun compiler
optimized_crew = patch_crew_pgo(crew, agent_id="research-agent")
`;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getIntegrationSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="w-full max-w-2xl bg-[#090A0B] border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden z-10 font-mono text-xs flex flex-col">
        <div className="p-3.5 border-b border-white/[0.05] flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#D7DADD]" />
            <span className="font-semibold text-xs text-[#F2F3F4] tracking-wide uppercase">
              AGENT TELEMETRY & RUNTIME INTEGRATION
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#5C6268] hover:text-[#D7DADD] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Frameworks Bar */}
        <div className="flex items-center border-b border-white/[0.05] bg-[#090A0B] px-3 overflow-x-auto">
          {frameworks.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFramework(f.id as any)}
              className={`py-2 px-3 border-b-2 whitespace-nowrap transition-colors text-xs uppercase font-medium ${
                activeFramework === f.id
                  ? 'border-[#D7DADD] text-[#F2F3F4]'
                  : 'border-transparent text-[#5C6268] hover:text-[#D7DADD]'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>

        <div className="p-4 bg-[#050505] flex-1 overflow-y-auto max-h-96">
          <pre className="text-[11px] text-[#D7DADD] leading-relaxed selection:bg-white/[0.1]">
            {getIntegrationSnippet()}
          </pre>
        </div>

        <div className="p-3 border-t border-white/[0.05] bg-[#050505] flex items-center justify-between">
          <span className="text-[#5C6268] text-[10px]">
            Real-time profiling hooks send execution latency & token metrics to twinerun.
          </span>
          <button
            onClick={handleCopy}
            className="px-3.5 py-1.5 rounded silver-btn-gradient text-[#050505] font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

