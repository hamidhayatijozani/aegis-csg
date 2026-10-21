import { create } from "zustand";
import { evaluateRequest, replayRecorded } from "./csg/engine";
import { CORPUS, GOLD_LABELS, liveEvent } from "./csg/fixtures";
import {
  DEFAULT_POLICY,
  type Decision,
  type EvaluatedEvent,
  type Mode,
  type PermissionRequest,
  type Policy,
  type Tab,
} from "./csg/types";

type AppState = {
  mode: Mode;
  yolo: boolean;
  live: boolean;
  policy: Policy;
  events: EvaluatedEvent[];
  selectedId: string | null;
  labels: Record<string, Decision>;
  tab: Tab;
  liveSeq: number;
  lastReplay: { id: string; match: boolean } | null;
  corpusLoaded: boolean;
  hydrateCorpus: () => void;
  setMode: (m: Mode) => void;
  setYolo: (v: boolean) => void;
  setLive: (v: boolean) => void;
  setTab: (t: Tab) => void;
  setPolicy: (p: Partial<Policy>) => void;
  ingest: (req: PermissionRequest) => EvaluatedEvent;
  select: (id: string | null) => void;
  label: (id: string, d: Decision) => void;
  replaySelected: () => boolean;
  runCorpus: () => void;
  tickLive: () => void;
  reset: () => void;
  reevaluateAll: () => void;
};

function evalOne(
  req: PermissionRequest,
  mode: Mode,
  yolo: boolean,
  policy: Policy,
): EvaluatedEvent {
  const { sanitized, decision } = evaluateRequest(req, { mode, yolo, policy });
  return {
    request: req,
    sanitized,
    decision,
    receivedAt: 0,
  };
}

function seedEvents(): EvaluatedEvent[] {
  return CORPUS.map((c) => evalOne(c.request, "observe", false, { ...DEFAULT_POLICY })).reverse();
}

const SEEDED = seedEvents();

export const useStore = create<AppState>()((set, get) => ({
  mode: "observe",
  yolo: false,
  live: true,
  policy: { ...DEFAULT_POLICY },
  events: SEEDED,
  selectedId: SEEDED[0]?.request.event_id ?? null,
  labels: { ...GOLD_LABELS },
  tab: "stream",
  liveSeq: 0,
  lastReplay: null,
  corpusLoaded: true,

  hydrateCorpus: () => {
    if (get().events.length > 0) return;
    get().runCorpus();
  },

  setMode: (mode) => set({ mode }),
  setYolo: (yolo) => set({ yolo }),
  setLive: (live) => set({ live }),
  setTab: (tab) => set({ tab }),
  setPolicy: (p) => set({ policy: { ...get().policy, ...p } }),

  ingest: (req) => {
    const { mode, yolo, policy, events } = get();
    const prior = events.find((e) => e.request.event_id === req.event_id);
    if (prior) {
      set({ selectedId: prior.request.event_id });
      return prior;
    }
    const ev = evalOne(req, mode, yolo, policy);
    ev.receivedAt = Date.now();
    const next = [ev, ...events].slice(0, 400);
    set({ events: next, selectedId: ev.request.event_id });
    return ev;
  },

  select: (id) => set({ selectedId: id }),

  label: (id, d) => set({ labels: { ...get().labels, [id]: d } }),

  replaySelected: () => {
    const { selectedId, events } = get();
    const ev = events.find((e) => e.request.event_id === selectedId);
    if (!ev) return false;
    const { match, next } = replayRecorded(ev.decision, ev.sanitized);
    set({
      lastReplay: { id: ev.request.event_id, match },
      events: events.map((e) =>
        e.request.event_id === ev.request.event_id ? { ...e, decision: next } : e,
      ),
    });
    return match;
  },

  runCorpus: () => {
    const { mode, yolo, policy } = get();
    const events = CORPUS.map((c) => evalOne(c.request, mode, yolo, policy)).reverse();
    set({
      events,
      corpusLoaded: true,
      selectedId: events[0]?.request.event_id ?? null,
    });
  },

  tickLive: () => {
    const seq = get().liveSeq + 1;
    set({ liveSeq: seq });
    get().ingest(liveEvent(seq));
  },

  reset: () => {
    const events = seedEvents();
    set({
      mode: "observe",
      yolo: false,
      live: true,
      policy: { ...DEFAULT_POLICY },
      labels: { ...GOLD_LABELS },
      lastReplay: null,
      events,
      selectedId: events[0]?.request.event_id ?? null,
      corpusLoaded: true,
    });
  },

  reevaluateAll: () => {
    const { events, mode, yolo, policy } = get();
    const next = events.map((e) => evalOne(e.request, mode, yolo, policy));
    set({ events: next });
  },
}));
