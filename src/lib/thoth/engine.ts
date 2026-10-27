export type Candle = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Phase = "TRENDING" | "RANGING" | "TURBULENT" | "INSUFFICIENT_DATA";
export type Side = "BUY" | "SELL" | "HOLD";

export type Signal = {
  signal: Side;
  confidence: number;
  entropy: number;
  phase: Phase;
  adx: number;
  momentum: number;
  reason: string;
};

export type Trade = {
  side: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  reason: "STOP_LOSS" | "TAKE_PROFIT" | "SIGNAL";
};

export type Backtest = {
  candles: Candle[];
  signals: Signal[];
  trades: Trade[];
  equity: { t: number; value: number }[];
  stats: {
    totalReturn: number;
    winRate: number;
    maxDrawdown: number;
    profitFactor: number;
    trades: number;
    sharpe: number;
    finalEquity: number;
  };
};

const WINDOW = 20;
const ADX_PERIOD = 14;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCandles(count = 240, seed = 20260912): Candle[] {
  const rng = mulberry32(seed);
  const out: Candle[] = [];
  let price = 100;
  const start = Date.UTC(2026, 8, 1);
  for (let i = 0; i < count; i++) {
    const regime = Math.floor(i / 60) % 4;
    const drift = regime === 0 ? 0.0016 : regime === 1 ? -0.0014 : regime === 2 ? 0 : 0.0004;
    const vol = regime === 2 ? 0.012 : 0.0045;
    const shock = (rng() - 0.5) * 2 * vol;
    const open = price;
    const close = Math.max(1, open * (1 + drift + shock));
    const wick = Math.abs(shock) * open * (0.4 + rng());
    const high = Math.max(open, close) + wick * rng();
    const low = Math.min(open, close) - wick * rng();
    out.push({ t: start + i * 3_600_000, open, high, low, close });
    price = close;
  }
  return out;
}

function clamp(n: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, n));
}

function shannon(returns: number[], bins = 10): number {
  if (returns.length < 2) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const r of returns) {
    if (r < min) min = r;
    if (r > max) max = r;
  }
  if (max === min) return 0;
  const counts = new Array<number>(bins).fill(0);
  for (const r of returns) {
    const idx = Math.min(bins - 1, Math.floor(((r - min) / (max - min)) * bins));
    counts[idx] += 1;
  }
  const n = returns.length;
  let h = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(bins);
}

function ema(data: number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const out = new Array<number>(data.length);
  out[0] = data[0] ?? 0;
  for (let i = 1; i < data.length; i++) out[i] = alpha * data[i]! + (1 - alpha) * out[i - 1]!;
  return out;
}

function wilder(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(0);
  if (values.length < period) return out;
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i] ?? 0;
  out[period - 1] = acc;
  for (let i = period; i < values.length; i++) {
    out[i] = out[i - 1]! - out[i - 1]! / period + (values[i] ?? 0);
  }
  return out;
}

function adxAt(high: number[], low: number[], close: number[]): number {
  const n = close.length;
  if (n < ADX_PERIOD * 2 + 1) return 0;
  const tr = new Array<number>(n).fill(0);
  const plus = new Array<number>(n).fill(0);
  const minus = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = high[i]! - high[i - 1]!;
    const down = low[i - 1]! - low[i]!;
    if (up > down && up > 0) plus[i] = up;
    if (down > up && down > 0) minus[i] = down;
    tr[i] = Math.max(high[i]! - low[i]!, Math.abs(high[i]! - close[i - 1]!), Math.abs(low[i]! - close[i - 1]!));
  }
  const trS = wilder(tr, ADX_PERIOD);
  const pS = wilder(plus, ADX_PERIOD);
  const mS = wilder(minus, ADX_PERIOD);
  const dx: number[] = [];
  for (let i = ADX_PERIOD; i < n; i++) {
    if (trS[i]! <= 0) continue;
    const pdi = (100 * pS[i]!) / trS[i]!;
    const mdi = (100 * mS[i]!) / trS[i]!;
    const den = pdi + mdi;
    if (den > 0) dx.push((100 * Math.abs(pdi - mdi)) / den);
  }
  if (dx.length < ADX_PERIOD) return 0;
  let adx = dx.slice(0, ADX_PERIOD).reduce((s, v) => s + v, 0) / ADX_PERIOD;
  for (let i = ADX_PERIOD; i < dx.length; i++) adx = (adx * (ADX_PERIOD - 1) + dx[i]!) / ADX_PERIOD;
  return adx;
}

export function signalAt(candles: Candle[]): Signal {
  if (candles.length < WINDOW + 10) {
    return {
      signal: "HOLD",
      confidence: 0,
      entropy: 0,
      phase: "INSUFFICIENT_DATA",
      adx: 0,
      momentum: 0,
      reason: "Not enough bars",
    };
  }
  const close = candles.map((c) => c.close);
  const returns: number[] = [];
  for (let i = 1; i < close.length; i++) returns.push(Math.log(close[i]! / close[i - 1]!));
  const entropy = shannon(returns.slice(-WINDOW));
  const adx = adxAt(
    candles.map((c) => c.high),
    candles.map((c) => c.low),
    close,
  );
  const fast = ema(close, 5);
  const slow = ema(close, 20);
  const momentum = (fast[fast.length - 1]! - slow[slow.length - 1]!) / slow[slow.length - 1]!;
  const phase: Phase = adx > 25 ? "TRENDING" : entropy < 0.35 ? "TURBULENT" : "RANGING";
  const momGate = 0.002;

  if (phase === "TRENDING") {
    if (momentum > momGate) {
      return {
        signal: "BUY",
        confidence: clamp(0.5 + Math.abs(momentum) * 40),
        entropy,
        phase,
        adx,
        momentum,
        reason: `Uptrend, ADX ${adx.toFixed(1)}`,
      };
    }
    if (momentum < -momGate) {
      return {
        signal: "SELL",
        confidence: clamp(0.5 + Math.abs(momentum) * 40),
        entropy,
        phase,
        adx,
        momentum,
        reason: `Downtrend, ADX ${adx.toFixed(1)}`,
      };
    }
    return { signal: "HOLD", confidence: 0.5, entropy, phase, adx, momentum, reason: "Trend, weak momentum" };
  }

  if (phase === "TURBULENT") {
    return { signal: "HOLD", confidence: 0.4, entropy, phase, adx, momentum, reason: "Turbulent — no trade" };
  }

  if (entropy < 0.55 && momentum < 0) {
    return { signal: "BUY", confidence: clamp(0.55 + (0.55 - entropy)), entropy, phase, adx, momentum, reason: "Range, buy the dip" };
  }
  if (entropy < 0.55 && momentum > 0) {
    return { signal: "SELL", confidence: clamp(0.55 + (0.55 - entropy)), entropy, phase, adx, momentum, reason: "Range, sell the rip" };
  }
  return { signal: "HOLD", confidence: 0.3, entropy, phase, adx, momentum, reason: "Range — wait" };
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return candles.at(-1)!.close * 0.01;
  const trs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
  }
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

export function runBacktest(candles: Candle[], initial = 10_000): Backtest {
  const signals: Signal[] = [];
  const trades: Trade[] = [];
  const equity: { t: number; value: number }[] = [];
  let cash = initial;
  let pos: { side: "LONG" | "SHORT"; entry: number; size: number; stop: number; take: number } | null = null;
  const fee = 0.0004;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const sig = signalAt(candles.slice(0, i + 1));
    signals.push(sig);

    if (pos) {
      const hitStop = pos.side === "LONG" ? c.low <= pos.stop : c.high >= pos.stop;
      const hitTake = pos.side === "LONG" ? c.high >= pos.take : c.low <= pos.take;
      if (hitStop || hitTake) {
        const exit = hitStop ? pos.stop : pos.take;
        const gross = pos.side === "LONG" ? (exit - pos.entry) * pos.size : (pos.entry - exit) * pos.size;
        const cost = exit * pos.size * fee;
        const pnl = gross - cost;
        cash += pnl;
        trades.push({ side: pos.side, entry: pos.entry, exit, pnl, reason: hitStop ? "STOP_LOSS" : "TAKE_PROFIT" });
        pos = null;
      }
    }

    if (!pos && sig.signal !== "HOLD" && i > WINDOW + 12) {
      const a = atr(candles.slice(0, i + 1));
      const stopDist = a * 1.5;
      if (stopDist > 0) {
        const risk = cash * 0.02;
        const size = risk / stopDist;
        const entry = c.close;
        const openFee = entry * size * fee;
        if (size > 0 && cash > openFee) {
          cash -= openFee;
          pos = {
            side: sig.signal === "BUY" ? "LONG" : "SHORT",
            entry,
            size,
            stop: sig.signal === "BUY" ? entry - stopDist : entry + stopDist,
            take: sig.signal === "BUY" ? entry + a * 2.5 : entry - a * 2.5,
          };
        }
      }
    }

    const mark = pos
      ? cash + (pos.side === "LONG" ? (c.close - pos.entry) * pos.size : (pos.entry - c.close) * pos.size)
      : cash;
    equity.push({ t: c.t, value: mark });
  }

  const finalEquity = equity.at(-1)?.value ?? initial;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const gain = wins.reduce((s, t) => s + t.pnl, 0);
  const loss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  let peak = initial;
  let maxDd = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = peak > 0 ? (peak - e.value) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]!.value;
    if (prev > 0) rets.push((equity[i]!.value - prev) / prev);
  }
  const mean = rets.reduce((s, v) => s + v, 0) / (rets.length || 1);
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length || 1);
  const sd = Math.sqrt(variance);
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;

  return {
    candles,
    signals,
    trades,
    equity,
    stats: {
      totalReturn: (finalEquity - initial) / initial,
      winRate: trades.length ? wins.length / trades.length : 0,
      maxDrawdown: maxDd,
      profitFactor: loss > 0 ? gain / loss : gain > 0 ? 99 : 0,
      trades: trades.length,
      sharpe,
      finalEquity,
    },
  };
}

export const THOTH_RUN = runBacktest(generateCandles());
