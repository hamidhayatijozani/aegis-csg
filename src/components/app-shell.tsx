import { ClaimDesk } from "@/components/claim-desk";
import { Composer } from "@/components/composer";
import { ContractView } from "@/components/contract-view";
import { EventStream } from "@/components/event-stream";
import { Inspector } from "@/components/inspector";
import { MetricsPanel } from "@/components/metrics-panel";
import { PolicyPanel } from "@/components/policy-panel";
import { ReplayLab } from "@/components/replay-lab";
import { ReportView } from "@/components/report-view";
import { ThothDesk } from "@/components/thoth-desk";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import type { Tab } from "@/lib/csg/types";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  FileJson,
  GitBranch,
  RotateCcw,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";

const NAV: { id: Tab; label: string; short: string; icon: typeof Shield }[] = [
  { id: "stream", label: "Stream", short: "Stream", icon: Activity },
  { id: "inspector", label: "Inspector", short: "Inspect", icon: Shield },
  { id: "replay", label: "Replay", short: "Replay", icon: RotateCcw },
  { id: "metrics", label: "Metrics", short: "Stats", icon: BarChart3 },
  { id: "policy", label: "Policy", short: "Policy", icon: SlidersHorizontal },
  { id: "contract", label: "Contract", short: "RFC", icon: FileJson },
  { id: "report", label: "Report", short: "Go", icon: ClipboardCheck },
];

const PROJECTS = [
  { id: "aegis", label: "Aegis", hint: "CSG · decision governance" },
  { id: "thoth", label: "Thoth", hint: "Entropy · paper series" },
  { id: "claims", label: "Claims", hint: "Support graph · local" },
] as const;

type ProjectId = (typeof PROJECTS)[number]["id"];

export function AppShell() {
  const [project, setProject] = useState<ProjectId>("aegis");
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const mode = useStore((s) => s.mode);
  const yolo = useStore((s) => s.yolo);
  const live = useStore((s) => s.live);
  const setLive = useStore((s) => s.setLive);
  const hydrateCorpus = useStore((s) => s.hydrateCorpus);
  const runCorpus = useStore((s) => s.runCorpus);
  const tickLive = useStore((s) => s.tickLive);
  const reset = useStore((s) => s.reset);
  const events = useStore((s) => s.events);
  const selectedId = useStore((s) => s.selectedId);
  const selected = events.find((e) => e.request.event_id === selectedId);
  const current = PROJECTS.find((p) => p.id === project) ?? PROJECTS[0];

  const reevaluateAll = useStore((s) => s.reevaluateAll);

  useEffect(() => {
    hydrateCorpus();
    reevaluateAll();
  }, [hydrateCorpus, reevaluateAll]);

  useEffect(() => {
    if (!live || project !== "aegis") return;
    const id = window.setInterval(() => tickLive(), 2400);
    return () => window.clearInterval(id);
  }, [live, tickLive, project]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <Toaster theme="dark" position="bottom-right" />
      <header className="border-b border-border px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-raised">
              {project === "aegis" ? (
                <Shield className="size-4 text-accent" strokeWidth={1.5} />
              ) : (
                <GitBranch className="size-4 text-accent" strokeWidth={1.5} />
              )}
            </span>
            <div>
              <p className="font-display text-2xl leading-none italic">{current.label}</p>
              <p className="text-xs uppercase tracking-wider text-subtle">{current.hint}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PROJECTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProject(p.id)}
                className={cn(
                  "h-10 rounded-md border px-3 text-xs",
                  project === p.id ? "border-border bg-raised text-fg" : "border-transparent text-subtle",
                )}
              >
                {p.label}
              </button>
            ))}
            {project === "aegis" ? (
              <>
                <span className="rounded-md border border-border bg-raised px-2 py-1 font-mono text-xs uppercase text-muted">
                  {mode}
                </span>
                {yolo ? (
                  <span className="rounded-md border border-ask/30 bg-ask/10 px-2 py-1 font-mono text-xs uppercase text-ask">
                    YOLO gated
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLive(!live)}
                  className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-xs text-muted"
                >
                  <span className={cn("size-1.5 rounded-full", live ? "bg-allow" : "bg-subtle")} />
                  {live ? "Live" : "Paused"}
                </button>
                <Button onClick={() => runCorpus()}>Load 200</Button>
                <Button variant="ghost" onClick={() => reset()}>
                  Reset
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {project === "thoth" ? <ThothDesk /> : null}
      {project === "claims" ? <ClaimDesk /> : null}

      {project === "aegis" ? (
        <div className="flex min-h-0 flex-1">
          <nav
            className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-border py-3 md:flex"
            aria-label="Primary"
          >
            {NAV.map((n) => {
              const Icon = n.icon;
              const on = tab === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  title={n.label}
                  onClick={() => setTab(n.id)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-md",
                    on ? "bg-raised text-fg" : "text-subtle hover:text-fg",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.6} />
                  <span className="sr-only">{n.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col md:flex-row">
            {(tab === "stream" || tab === "inspector") && (
              <>
                <aside className="h-[40vh] w-full shrink-0 border-b border-border md:h-auto md:w-80 md:border-b-0 md:border-r">
                  <EventStream />
                </aside>
                <main className="min-w-0 flex-1">
                  {tab === "stream" ? (
                    <div className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
                      <div className="md:col-span-2">
                        <p className="max-w-xl text-sm leading-relaxed text-muted">
                          AgentRQ orchestrates agents. Aegis decides whether a tool call is trusted —
                          with evidence, a lineage token, and a replay that another engineer can run.
                        </p>
                      </div>
                      <Composer />
                      <div className="rounded-xl border border-border bg-surface p-4">
                        <MetricsPanel compact />
                      </div>
                    </div>
                  ) : (
                    <Inspector event={selected} />
                  )}
                </main>
              </>
            )}

            {tab !== "stream" && tab !== "inspector" && (
              <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
                {tab === "replay" && <ReplayLab />}
                {tab === "metrics" && <MetricsPanel />}
                {tab === "policy" && <PolicyPanel />}
                {tab === "contract" && <ContractView />}
                {tab === "report" && <ReportView />}
              </main>
            )}
          </div>
        </div>
      ) : null}

      {project === "aegis" ? (
        <nav
          className="sticky bottom-0 grid grid-cols-7 border-t border-border bg-bg/95 md:hidden"
          aria-label="Mobile"
        >
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = tab === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setTab(n.id)}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-xs",
                  on ? "text-fg" : "text-subtle",
                )}
              >
                <Icon className="size-4" strokeWidth={1.6} />
                {n.short}
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
