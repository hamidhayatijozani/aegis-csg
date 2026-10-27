import { analyzeClaims, SAMPLE_TEXT, type ClaimType } from "@/lib/claims/lab";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const TONE: Record<ClaimType, string> = {
  Observation: "text-allow",
  Inference: "text-ask",
  Explanation: "text-sandbox",
  Ontology: "text-deny",
};

export function ClaimDesk() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const { props, edges } = useMemo(() => analyzeClaims(text), [text]);
  const weakest = edges.reduce<(typeof edges)[number] | null>(
    (best, e) => (!best || e.gap > best.gap ? e : best),
    null,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-subtle">Local · no model call</p>
        <h2 className="mt-1 font-display text-4xl italic">Claim Lab</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          Splits a paragraph into claims and scores whether an earlier sentence actually supports a
          later one. Ontology claims stay unsupported unless the evidence is already in the text.
        </p>
      </header>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="w-full rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-fg outline-none"
      />
      <section className="space-y-2">
        {props.map((p) => (
          <article key={p.idx} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-subtle">
              <span className={cn(TONE[p.type])}>{p.type}</span>
              <span className="mx-2">·</span>
              evidence {p.evidence.toFixed(2)}
            </p>
            <p className="mt-1 text-sm leading-relaxed">{p.text}</p>
          </article>
        ))}
        {props.length === 0 ? <p className="text-sm text-muted">Write at least one sentence.</p> : null}
      </section>
      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-subtle">Edges</h3>
        {edges.map((e) => (
          <div
            key={`${e.src}-${e.dst}`}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              weakest && e.src === weakest.src && e.dst === weakest.dst ? "border-ask" : "border-border",
            )}
          >
            <p className="font-mono text-xs text-muted">
              {e.src} → {e.dst} · {e.status} · gap {e.gap.toFixed(2)}
            </p>
            <p className="mt-1 text-muted">
              {props[e.src]?.text} → {props[e.dst]?.text}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
