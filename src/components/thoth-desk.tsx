import { THOTH_RUN } from "@/lib/thoth/engine";
import { cn } from "@/lib/utils";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const run = THOTH_RUN;
const last = run.signals[run.signals.length - 1]!;
const chart = run.candles.map((c, i) => ({
  i,
  close: Number(c.close.toFixed(2)),
  equity: Number(run.equity[i]!.value.toFixed(2)),
}));

export function ThothDesk() {
  const s = run.stats;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-subtle">Paper only · seed 20260912</p>
        <h2 className="mt-1 font-display text-4xl italic">Thoth</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          Shannon entropy, Wilder ADX, and EMA momentum on a fixed synthetic series. No live orders.
          The numbers below are this run, not a promise.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat k="Signal" v={last.signal} />
        <Stat k="Phase" v={last.phase} />
        <Stat k="ADX" v={last.adx.toFixed(1)} />
        <Stat k="Return" v={`${(s.totalReturn * 100).toFixed(1)}%`} />
        <Stat k="Win rate" v={`${(s.winRate * 100).toFixed(0)}%`} />
        <Stat k="Max DD" v={`${(s.maxDrawdown * 100).toFixed(1)}%`} />
        <Stat k="Profit factor" v={s.profitFactor.toFixed(2)} />
        <Stat k="Sharpe" v={s.sharpe.toFixed(2)} />
        <Stat k="Trades" v={String(s.trades)} />
      </div>
      <p className="text-sm text-muted">{last.reason}</p>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-xs uppercase tracking-wider text-subtle">Close</h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid stroke="#2a2a30" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis domain={["auto", "auto"]} width={48} stroke="#6e6e77" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "#111114", border: "1px solid #2a2a30", borderRadius: 8 }}
                labelStyle={{ color: "#9a9aa3" }}
              />
              <Line type="monotone" dataKey="close" stroke="#d4d7de" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-xs uppercase tracking-wider text-subtle">Equity · start 10,000</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid stroke="#2a2a30" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis domain={["auto", "auto"]} width={56} stroke="#6e6e77" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "#111114", border: "1px solid #2a2a30", borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="equity" stroke="#7d9a7a" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <ul className="space-y-2">
        {run.trades.slice(-6).reverse().map((t, i) => (
          <li key={`${t.entry}-${i}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className={cn(t.pnl >= 0 ? "text-allow" : "text-deny")}>{t.side}</span>
            <span className="font-mono text-xs text-muted">{t.reason}</span>
            <span className="font-mono tabular">{t.pnl.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-subtle">{k}</p>
      <p className="mt-1 font-mono text-lg tabular">{v}</p>
    </div>
  );
}
