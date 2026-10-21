import { DecisionBadge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { TOOL_CATALOG } from "@/lib/csg/engine";

const TICK: Record<string, string> = {
  allow: "bg-allow",
  deny: "bg-deny",
  ask: "bg-ask",
  sandbox: "bg-sandbox",
  defer: "bg-defer",
};

export function EventStream() {
  const events = useStore((s) => s.events);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setTab = useStore((s) => s.setTab);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-subtle">Permission stream</h2>
        <span className="font-mono text-xs tabular text-muted">{events.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="px-3 py-8 text-sm text-muted">No events yet. Load the corpus to start the POC.</p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => {
              const active = e.request.event_id === selectedId;
              const tool = TOOL_CATALOG[e.request.tool_name];
              return (
                <li key={e.request.event_id}>
                  <button
                    type="button"
                    onClick={() => {
                      select(e.request.event_id);
                      setTab("inspector");
                    }}
                    className={cn(
                      "flex w-full items-stretch gap-3 px-3 py-2.5 text-left transition-colors duration-150",
                      active ? "bg-raised" : "hover:bg-surface",
                    )}
                  >
                    <span
                      className={cn("w-0.5 shrink-0 rounded-full", TICK[e.decision.decision])}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-fg">{e.request.event_id}</span>
                        <DecisionBadge decision={e.decision.decision} />
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                        <span className="truncate">
                          {tool?.label ?? e.request.tool_name}
                          <span className="text-subtle"> · {e.request.agent_id}</span>
                        </span>
                        <span className="shrink-0 font-mono tabular">
                          {e.decision.confidence.toFixed(2)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
