import { Button } from "@/components/ui/button";
import { DEFAULT_POLICY } from "@/lib/csg/types";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

const SLIDERS: { key: keyof typeof DEFAULT_POLICY; label: string; min: number; max: number; step: number }[] = [
  { key: "deny_threshold", label: "Deny threshold", min: 0.5, max: 0.99, step: 0.01 },
  { key: "ask_threshold", label: "Ask threshold", min: 0.3, max: 0.9, step: 0.01 },
  { key: "sandbox_threshold", label: "Sandbox threshold", min: 0.2, max: 0.8, step: 0.01 },
  { key: "min_evidence", label: "Min evidence", min: 0.1, max: 0.9, step: 0.01 },
  { key: "yolo_risk", label: "YOLO max risk", min: 0.1, max: 0.7, step: 0.01 },
  { key: "yolo_evidence", label: "YOLO min evidence", min: 0.4, max: 0.95, step: 0.01 },
  { key: "yolo_policy_fit", label: "YOLO min policy fit", min: 0.3, max: 0.95, step: 0.01 },
];

export function PolicyPanel() {
  const policy = useStore((s) => s.policy);
  const setPolicy = useStore((s) => s.setPolicy);
  const reevaluateAll = useStore((s) => s.reevaluateAll);
  const yolo = useStore((s) => s.yolo);
  const setYolo = useStore((s) => s.setYolo);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl italic">Policy engine</h2>
      <p className="text-sm leading-relaxed text-muted">
        Thresholds are data, not code. Apply & replay re-scores every stored event with the same
        engine so lineage drift is visible.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["observe", "suggest", "enforce"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              mode === m
                ? "h-10 rounded-md bg-accent px-3 text-sm text-accent-fg"
                : "h-10 rounded-md border border-border px-3 text-sm text-muted"
            }
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setYolo(!yolo)}
          className={
            yolo
              ? "h-10 rounded-md bg-ask/20 px-3 text-sm text-ask"
              : "h-10 rounded-md border border-border px-3 text-sm text-muted"
          }
        >
          YOLO {yolo ? "gated" : "off"}
        </button>
      </div>
      <ul className="space-y-4">
        {SLIDERS.map((s) => {
          const value = Number(policy[s.key]);
          return (
            <li key={s.key}>
              <div className="flex items-baseline justify-between text-sm">
                <label htmlFor={s.key} className="text-fg">
                  {s.label}
                </label>
                <span className="font-mono tabular text-muted">{value.toFixed(2)}</span>
              </div>
              <input
                id={s.key}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={value}
                onChange={(e) => setPolicy({ [s.key]: Number(e.target.value) })}
                className="mt-1 w-full accent-accent"
              />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            reevaluateAll();
            toast("Corpus re-scored against the current policy.");
          }}
        >
          Apply & replay corpus
        </Button>
        <Button
          onClick={() => {
            setPolicy(DEFAULT_POLICY);
            toast("Restored default policy.");
          }}
        >
          Reset thresholds
        </Button>
      </div>
    </div>
  );
}
