import { Button } from "@/components/ui/button";
import { TOOL_CATALOG } from "@/lib/csg/engine";
import { useStore } from "@/lib/store";
import type { Sensitivity } from "@/lib/csg/types";
import { useState } from "react";
import { toast } from "sonner";

const TAGS = ["prod", "finance", "pii", "sandbox", "research"];

export function Composer() {
  const ingest = useStore((s) => s.ingest);
  const setTab = useStore((s) => s.setTab);
  const [tool, setTool] = useState("read_file");
  const [params, setParams] = useState('{"path":"README.md"}');
  const [sensitivity, setSensitivity] = useState<Sensitivity>("med");
  const [tags, setTags] = useState<string[]>(["research"]);

  function fire() {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(params) as Record<string, unknown>;
    } catch {
      toast.error("tool_params must be valid JSON.");
      return;
    }
    const now = new Date().toISOString();
    const ev = ingest({
      event_type: "permission_request",
      event_id: `req-custom-${Date.now().toString(36)}`,
      workspace_id: "demo-workspace",
      task_id: "task-composer",
      agent_id: "agent-alpha",
      timestamp: now,
      tool_name: tool,
      tool_params: parsed,
      context: {
        policy_tags: tags,
        recent_messages: [{ sender: "operator", text: "Manual permission_request from composer.", ts: now }],
      },
      sensitivity,
    });
    setTab("inspector");
    toast(`Gate returned ${ev.decision.decision}.`);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl italic">Fire a request</h3>
        <span className="text-xs text-subtle">AgentRQ → CSG</span>
      </div>
      <label className="block text-xs uppercase tracking-wider text-subtle">
        Tool
        <select
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-border bg-raised px-2 text-sm text-fg"
        >
          {Object.keys(TOOL_CATALOG).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs uppercase tracking-wider text-subtle">
        Params (JSON)
        <textarea
          value={params}
          onChange={(e) => setParams(e.target.value)}
          rows={3}
          suppressHydrationWarning
          className="mt-1 w-full rounded-md border border-border bg-raised px-2 py-2 font-mono text-xs text-fg"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs uppercase tracking-wider text-subtle">
          Sensitivity
          <select
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as Sensitivity)}
            className="mt-1 h-10 rounded-md border border-border bg-raised px-2 text-sm text-fg"
          >
            <option value="low">low</option>
            <option value="med">med</option>
            <option value="high">high</option>
          </select>
        </label>
        <fieldset className="flex flex-wrap items-end gap-1.5">
          <legend className="text-xs uppercase tracking-wider text-subtle">Tags</legend>
          {TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                className={
                  on
                    ? "h-8 rounded-full bg-accent px-3 text-xs text-accent-fg"
                    : "h-8 rounded-full border border-border px-3 text-xs text-muted"
                }
              >
                {t}
              </button>
            );
          })}
        </fieldset>
      </div>
      <Button variant="primary" className="w-full" onClick={fire}>
        Submit permission_request
      </Button>
    </div>
  );
}
