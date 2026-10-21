import { API_ERRORS, RFCS } from "@/lib/csg/specs";
import { FORMULAS, PRINCIPLES } from "@/lib/csg/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

const SECTIONS: { key: keyof (typeof RFCS)[number]; label: string }[] = [
  { key: "definition", label: "Definition" },
  { key: "scope", label: "Scope" },
  { key: "inputs", label: "Inputs" },
  { key: "outputs", label: "Outputs" },
  { key: "computation", label: "Computation" },
  { key: "complexity", label: "Complexity" },
  { key: "failure", label: "Failure conditions" },
  { key: "groundTruth", label: "Ground truth" },
  { key: "benchmark", label: "Benchmark" },
  { key: "acceptance", label: "Acceptance" },
  { key: "limitations", label: "Known limitations" },
];

export function ContractView() {
  const [id, setId] = useState(RFCS[0].id);
  const doc = RFCS.find((r) => r.id === id) ?? RFCS[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-subtle">Specification</p>
        <h2 className="mt-1 font-display text-4xl italic leading-tight">Engineering artifacts</h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
          Principles through evaluation, in one gate. Each document states what is computed, from
          which fields, and how a reviewer would reject it.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {RFCS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setId(r.id)}
            className={cn(
              "h-11 shrink-0 rounded-md border px-3 font-mono text-xs",
              r.id === doc.id
                ? "border-border bg-raised text-fg"
                : "border-transparent text-subtle",
            )}
          >
            {r.id.replace("RFC-", "")}
          </button>
        ))}
      </div>

      <article className="space-y-4">
        <div>
          <p className="font-mono text-xs text-subtle">{doc.id}</p>
          <h3 className="font-display text-3xl italic">{doc.title}</h3>
        </div>
        {SECTIONS.map((s) => (
          <section key={s.key} className="rounded-xl border border-border bg-surface px-4 py-3">
            <h4 className="text-xs uppercase tracking-wider text-subtle">{s.label}</h4>
            <p className="mt-1 text-sm leading-relaxed text-fg">{doc[s.key]}</p>
          </section>
        ))}
      </article>

      {doc.id === "RFC-0000" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-sm text-fg">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {doc.id === "RFC-0000.5" ? (
        <section className="space-y-2">
          <h3 className="text-sm uppercase tracking-wider text-subtle">Error model</h3>
          <ul className="space-y-2">
            {API_ERRORS.map((e) => (
              <li key={e.code} className="rounded-xl border border-border bg-surface px-4 py-3">
                <p className="font-mono text-sm text-fg">
                  {e.code} {e.name}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{e.when}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.id === "RFC-0003" ? (
        <dl className="space-y-2">
          {Object.entries(FORMULAS).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-surface px-3 py-2">
              <dt className="font-mono text-xs uppercase text-subtle">{k}</dt>
              <dd className="mt-1 font-mono text-xs leading-relaxed text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
