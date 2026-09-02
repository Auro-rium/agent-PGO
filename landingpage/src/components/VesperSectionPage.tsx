import React, { useEffect, useState } from "react";
import { ArrowRight, Check, Menu, Minus, Plus, X } from "lucide-react";
import { CANDIDATE_CONFIGS } from "../data/mockAgents";
import { OptimizationCandidate } from "../types";

export type VesperRoute =
  "benefits" | "how-it-works" | "benchmarks" | "faqs" | "pricing";
interface Props {
  route: VesperRoute;
  onLaunchStudio: () => void;
  session?: { email: string };
  onStartCheckout?: (referralCode?: string) => void;
  checkoutState?: "idle" | "starting" | "error";
  checkoutError?: string;
}
const links: Array<[VesperRoute, string]> = [
  ["benefits", "Benefits"],
  ["how-it-works", "How It Works"],
  ["benchmarks", "Benchmarks"],
  ["faqs", "FAQs"],
  ["pricing", "Pricing"],
];
const benefits = [
  [
    "01",
    "Reduce inference cost",
    "See exactly which nodes dominate spend and test cheaper model substitutions automatically.",
    "MODEL COST ↓",
  ],
  [
    "02",
    "Preserve quality",
    "Every candidate is evaluated against the same tasks as your current agent before it can be recommended.",
    "QUALITY GATE",
  ],
  [
    "03",
    "Lower latency",
    "Replace unnecessary heavyweight calls with faster models where they perform just as well.",
    "P95 LATENCY ↓",
  ],
  [
    "04",
    "Optimize safely",
    "TwineRun works offline first. It recommends a configuration and leaves deployment under your control.",
    "NO AUTO-DEPLOY",
  ],
] as const;
const steps = [
  [
    "01",
    "Profile",
    "Connect your agent or ingest OpenTelemetry traces. TwineRun measures model usage, tokens, latency, cost, and execution structure.",
    ["Planner      $0.061", "Researcher   $0.119", "Reasoner     $0.143"],
  ],
  [
    "02",
    "Establish the baseline",
    "Run your existing eval suite to measure the quality, cost, and latency of the current configuration.",
    ["QUALITY   92.4%", "COST      $0.382 / run", "P95       24.1s"],
  ],
  [
    "03",
    "Search",
    "TwineRun tests alternative model assignments and keeps configurations that stay inside your quality tolerance.",
    [
      "Sol → Luna       PASS",
      "Sol → Flash      PASS",
      "Sol → Luna       REJECT",
    ],
  ],
  [
    "04",
    "Compile",
    "Choose the cost-quality tradeoff you want and export the verified configuration.",
    ["$0.382 → $0.141", "63.1% lower cost", "92.4% → 92.7% quality"],
  ],
] as const;
const faqs = [
  [
    "What exactly does TwineRun optimize?",
    "TwineRun V1 optimizes the model assigned to each step of an AI agent. It identifies where cheaper models can replace expensive ones without exceeding your allowed quality regression.",
  ],
  [
    "Does TwineRun change my production agent automatically?",
    "No. Optimization happens offline. TwineRun produces a tested recommendation that you review and export before making any production change.",
  ],
  [
    "How does TwineRun know whether a cheaper model is good enough?",
    "It runs candidate configurations against your evaluation dataset and compares them with your current baseline. Candidates that fall outside your quality tolerance are rejected.",
  ],
  [
    "Do I need to send prompts or outputs?",
    "Not for basic profiling. Model, token, latency, cost, and execution metadata can be collected without storing prompt or output content.",
  ],
  [
    "Which agents and models can I use?",
    "TwineRun is designed to be framework-agnostic through normalized traces and OpenTelemetry.",
  ],
  [
    "Is TwineRun another model router?",
    "No. A router decides which model to use at runtime. TwineRun profiles and experimentally optimizes an existing agent before deployment.",
  ],
] as const;

const benchmarkCandidates = CANDIDATE_CONFIGS.filter(
  (candidate) => candidate.isParetoOptimal || candidate.isBaseline,
);
const benchmarkX = (cost: number) => 58 + ((cost - 0.05) / 0.37) * 594;
const benchmarkY = (quality: number) => 286 - ((quality - 86) / 10) * 230;

const Logo = () => (
  <img className="vesper-logo-image" src="/twinerun-logo.png" alt="TwineRun" />
);

function Header({ onLaunchStudio }: { onLaunchStudio: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  useEffect(() => {
    document.body.classList.toggle("vesper-menu-open", open);
    return () => document.body.classList.remove("vesper-menu-open");
  }, [open]);
  return (
    <>
      <header className="vesper-header vesper-header--long vesper-route-header">
        <a
          href="/"
          className="vesper-logo"
          onClick={close}
          aria-label="TwineRun home"
        >
          <Logo />
        </a>
        <nav className="vesper-nav" aria-label="Primary navigation">
          {links.map(([id, label]) => (
            <a
              key={id}
              href={`/${id}`}
              className="vesper-nav-link"
              onClick={close}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="vesper-header-actions">
          <a href="/signin?returnTo=%2Fstudio" className="vesper-btn vesper-btn--solid vesper-header-cta">
            Launch TwineRun
          </a>
          <button
            className="vesper-burger"
            onClick={() => setOpen((value) => !value)}
            aria-controls="route-mobile-nav"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>
      <nav
        id="route-mobile-nav"
        className="vesper-mobile-nav"
        aria-label="Mobile primary navigation"
      >
        {links.map(([id, label]) => (
          <a
            key={id}
            href={`/${id}`}
            className="vesper-mobile-link"
            onClick={close}
          >
            {label}
          </a>
        ))}
        <a href="/signin?returnTo=%2Fstudio" className="vesper-btn vesper-btn--solid vesper-mobile-cta">
          Launch TwineRun <ArrowRight size={15} />
        </a>
      </nav>
    </>
  );
}

export const VesperSectionPage: React.FC<Props> = ({
  route,
  onLaunchStudio,
  session,
  onStartCheckout,
  checkoutState = "idle",
  checkoutError,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState("42");
  const referralCode = new URLSearchParams(window.location.search).get("ref")?.trim() || "";
  const signupPath = referralCode ? `/signup?ref=${encodeURIComponent(referralCode)}` : "/signup";
  const checkoutReturn = `/pricing?checkout=pro${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ""}`;
  const selectedBenchmark =
    benchmarkCandidates.find(
      (candidate) => candidate.id === selectedBenchmarkId,
    ) || benchmarkCandidates[0];
  const page = {
    benchmarks: [
      "EMPIRICAL BENCHMARKS",
      "Find the cheapest configuration worth deploying.",
      "Every point is a tested configuration of your agent. Set your quality tolerance and inspect the candidates that survive it.",
    ],
    benefits: [
      "WHY TWINERUN",
      "Spend intelligence where it actually matters.",
      "Most agents use expensive models far more often than necessary. TwineRun finds where cheaper execution is safe and where frontier intelligence must stay.",
    ],
    "how-it-works": [
      "THE WORKFLOW",
      "Your agent goes in. A better execution plan comes out.",
      "Profile the system you have, establish an empirical baseline, search the model space, and export the configuration that survives your quality gate.",
    ],
    faqs: [
      "QUESTIONS",
      "Clear answers before you optimize.",
      "TwineRun is built around measured tradeoffs, explicit tolerances, and human approval before production changes.",
    ],
    pricing: [
      "LAUNCH PRICING",
      "Start where your agent is.",
      "Launch prices for builders finding the best cost-quality tradeoff.",
    ],
  }[route] as [string, string, string];
  const renderBenchmark = (candidate: OptimizationCandidate) => {
    const isSelected = candidate.id === selectedBenchmark.id;
    const pointClass = isSelected
      ? "is-selected"
      : candidate.isBaseline
        ? "is-baseline"
        : candidate.isBalanced
          ? "is-balanced"
          : "";
    return (
      <g
        key={candidate.id}
        className="vesper-benchmark-point"
        role="button"
        tabIndex={0}
        aria-label={"Select candidate " + candidate.id}
        onClick={() => setSelectedBenchmarkId(candidate.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ")
            setSelectedBenchmarkId(candidate.id);
        }}
      >
        <circle
          cx={benchmarkX(candidate.costPerReq)}
          cy={benchmarkY(candidate.qualityPct)}
          r={
            isSelected
              ? 8
              : candidate.isBalanced ||
                  candidate.isCheapest ||
                  candidate.isHighestQuality
                ? 6
                : 4.5
          }
          className={pointClass}
        />
        {candidate.isBalanced && (
          <text
            x={benchmarkX(candidate.costPerReq)}
            y={benchmarkY(candidate.qualityPct) - 15}
            className="vesper-benchmark-label"
            textAnchor="middle"
          >
            BALANCED #42
          </text>
        )}
      </g>
    );
  };
  const paretoPath = benchmarkCandidates
    .filter((candidate) => candidate.isParetoOptimal)
    .sort((a, b) => a.costPerReq - b.costPerReq)
    .map(
      (candidate, index) =>
        (index === 0 ? "M" : "L") +
        " " +
        benchmarkX(candidate.costPerReq) +
        " " +
        benchmarkY(candidate.qualityPct),
    )
    .join(" ");
  return (
    <div className="vesper-page vesper-page--long vesper-route-page">
      <div className="vesper-grain" aria-hidden="true" />
      <div className="vesper-photo" aria-hidden="true">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
      </div>
      <div className="vesper-backdrop" aria-hidden="true" />
      <Header onLaunchStudio={onLaunchStudio} />
      <main className="vesper-route-main" id="top">
        <section className="vesper-route-hero">
          <p className="vesper-eyebrow">{page[0]}</p>
          <h1>{page[1]}</h1>
          <p>{page[2]}</p>
          <a href={session ? "/studio" : "/signin?returnTo=%2Fstudio"} className="vesper-btn vesper-btn--solid">
            Optimize an Agent <ArrowRight size={15} />
          </a>
          {route === "pricing" && checkoutState === "starting" && <p className="vesper-checkout-note" role="status">Preparing secure checkout…</p>}
          {route === "pricing" && checkoutState === "error" && checkoutError && <p className="vesper-checkout-error" role="alert">{checkoutError}</p>}
        </section>
        {route === "benefits" && (
          <section className="vesper-route-content">
            <div className="vesper-route-grid">
              {benefits.map(([n, title, body, label]) => (
                <article className="vesper-route-card" key={n}>
                  <span className="vesper-index">{n}</span>
                  <h2>{title}</h2>
                  <p>{body}</p>
                  <span className="vesper-mini-label">{label}</span>
                </article>
              ))}
            </div>
            <div className="vesper-route-callout">
              <strong>One mental model:</strong> TwineRun finds where your agent
              is overspending on intelligence, tests cheaper alternatives, and
              proves which configuration still works.
            </div>
          </section>
        )}
        {route === "how-it-works" && (
          <section className="vesper-route-content">
            <div className="vesper-route-steps">
              {steps.map(([n, title, body, rows]) => (
                <article className="vesper-route-step" key={n}>
                  <span className="vesper-step-number">{n}</span>
                  <div>
                    <h2>{title}</h2>
                    <p>{body}</p>
                  </div>
                  <pre>{rows.join("\n")}</pre>
                </article>
              ))}
            </div>
            <p className="vesper-closing-line">
              TwineRun does not guess. It benchmarks.
            </p>
          </section>
        )}
        {route === "benchmarks" && (
          <section className="vesper-route-content vesper-benchmark-route">
            <div className="vesper-demo-shell">
              <div className="vesper-chart">
                <span className="vesper-chart-axis vesper-chart-axis--y">QUALITY ↑</span>
                <span className="vesper-chart-axis vesper-chart-axis--x">COST / EXECUTION →</span>
                <svg viewBox="0 0 720 330" role="img" aria-label="Pareto frontier of tested agent configurations">
                  <line x1="58" y1="286" x2="680" y2="286" stroke="rgba(255,255,255,.18)" />
                  <line x1="58" y1="56" x2="58" y2="286" stroke="rgba(255,255,255,.18)" />
                  <path d={paretoPath} fill="none" stroke="rgba(235,235,235,.68)" strokeWidth="1.5" strokeDasharray="4 5" />
                  {benchmarkCandidates.map(renderBenchmark)}
                </svg>
              </div>
              <aside className="vesper-candidate">
                <p className="vesper-eyebrow">SELECTED CONFIGURATION</p>
                <h3>Candidate #{selectedBenchmark.id}</h3>
                <div className="vesper-candidate-price">${selectedBenchmark.costPerReq.toFixed(3)}<span> / execution</span></div>
                <div className="vesper-candidate-stats">
                  <div>QUALITY <b>{selectedBenchmark.qualityPct.toFixed(1)}%</b></div>
                  <div>P95 <b>{(selectedBenchmark.id === "42" ? selectedBenchmark.latencySec : selectedBenchmark.p95LatencySec).toFixed(1)}s</b></div>
                  <div className="vesper-savings"><b>{selectedBenchmark.savingsPct.toFixed(1)}% lower cost</b></div>
                </div>
                <a href={session ? "/studio" : "/signin?returnTo=%2Fstudio"} className="vesper-btn vesper-btn--solid">Optimize an Agent <ArrowRight size={15} /></a>
              </aside>
            </div>
            <p className="vesper-demo-note">Set your quality tolerance. TwineRun searches the model space and shows you the configurations that survive it.</p>
          </section>
        )}
        {route === "faqs" && (
          <section className="vesper-route-content">
            <div className="vesper-faq-list vesper-route-faqs">
              {faqs.map(([question, answer], index) => (
                <div className="vesper-faq" key={question}>
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    aria-expanded={openFaq === index}
                  >
                    <span>{question}</span>
                    {openFaq === index ? (
                      <Minus size={17} />
                    ) : (
                      <Plus size={17} />
                    )}
                  </button>
                  {openFaq === index && <p>{answer}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
        {route === "pricing" && (
          <section className="vesper-route-content">
            <div className="vesper-pricing-grid">
              {[
                [
                  "FREE",
                  "$0",
                  "For experimenting and small personal agents.",
                  [
                    "1 agent",
                    "Local profiling",
                    "Cost and latency analysis",
                    "Small evaluation suites",
                    "Basic optimization runs",
                    "PGO config export",
                  ],
                ],
                [
                  "PRO",
                  "$49 / month",
                  "For indie hackers shipping agents to users.",
                  [
                    "Up to 5 agents",
                    "Hosted profiling",
                    "Larger evaluation suites",
                    "Full model optimization",
                    "Pareto frontier",
                    "Optimization history",
                    "Configuration exports",
                    "Email support",
                  ],
                ],
                [
                  "TEAM",
                  "$249 / month",
                  "For teams running production AI systems.",
                  [
                    "Up to 20 agents",
                    "Shared projects",
                    "Team eval suites",
                    "Higher optimization limits",
                    "Run history",
                    "CI integration",
                    "Advanced retention controls",
                    "Priority support",
                  ],
                ],
              ].map(([name, price, audience, features], index) => (
                <article
                  className={`vesper-price-card ${index === 1 ? "vesper-price-card--featured" : ""}`}
                  key={name as string}
                >
                  {index === 1 && (
                    <span className="vesper-popular">MOST POPULAR</span>
                  )}
                  <p className="vesper-eyebrow">{name as string}</p>
                  <h2>{price as string}</h2>
                  <p>{audience as string}</p>
                  <ul>
                    {(features as string[]).map((feature) => (
                      <li key={feature}>
                        <Check size={14} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {index === 2 ? (
                    <button type="button" className="vesper-btn vesper-btn--ghost vesper-btn--disabled" disabled>
                      Coming later
                    </button>
                  ) : index === 0 ? (
                    <a href={signupPath} className="vesper-btn vesper-btn--ghost">Start Free <ArrowRight size={15} /></a>
                  ) : session ? (
                    <button type="button" className="vesper-btn vesper-btn--solid" onClick={() => onStartCheckout?.(referralCode || undefined)}>Start Optimizing <ArrowRight size={15} /></button>
                  ) : (
                    <a href={`/signin?returnTo=${encodeURIComponent(checkoutReturn)}`} className="vesper-btn vesper-btn--solid">Start Optimizing <ArrowRight size={15} /></a>
                  )}
                </article>
              ))}
            </div>
            <div className="vesper-sprint">
              <div>
                <p className="vesper-eyebrow">HIGH-VOLUME PRODUCTION AGENT?</p>
                <h2>Agent Optimization Sprint</h2>
                <p>We profile and optimize it with you.</p>
              </div>
              <strong>From $2,500</strong>
              <a href="mailto:hello@twinerun.ai?subject=Agent%20Optimization%20Sprint" className="vesper-btn vesper-btn--ghost">Talk to Us <ArrowRight size={15} /></a>
            </div>
          </section>
        )}
      </main>
      <footer className="vesper-long-footer">
        <span>TwineRun.ai</span>
        <span>Profile-guided optimization for AI agents.</span>
        <span>© 2026</span>
      </footer>
    </div>
  );
};
