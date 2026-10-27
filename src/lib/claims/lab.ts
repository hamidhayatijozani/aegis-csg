export type ClaimType = "Observation" | "Inference" | "Explanation" | "Ontology";
export type EdgeStatus = "SUPPORT" | "WEAK_SUPPORT" | "UNSUPPORTED" | "UNKNOWN";

export type Proposition = {
  idx: number;
  text: string;
  type: ClaimType;
  evidence: number;
};

export type Edge = {
  src: number;
  dst: number;
  status: EdgeStatus;
  support: number;
  gap: number;
};

const OBS = ["sensor", "recorded", "report", "measured", "سنسور", "ثبت", "مشاهده"];
const INF = ["therefore", "so ", "thus", "بنابراین", "پس ", "نتیجه"];
const EXP = ["because", "since", "چون", "زیرا", "به دلیل"];
const ONT = ["consciousness", "reality", "essence", "آگاهی", "هستی", "واقعیت", "ذات"];
const EVID = [/data/i, /study/i, /experiment/i, /داده/, /گزارش/, /آزمایش/, /ثبت شده/];

export const SAMPLE_TEXT = `سنسور کالیبره‌شده دمای ۲۵ درجه را ثبت کرده است.
بنابراین دما از آستانه ۲۰ درجه بالاتر است.
پس سیستم خنک‌کننده باید روشن شود.
در نهایت، آگاهی ماشینی واقعی است.`;

function splitSentences(text: string): string[] {
  return text
    .split(/[.!؟?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function classify(text: string): ClaimType {
  const low = text.toLowerCase();
  if (ONT.some((w) => low.includes(w))) return "Ontology";
  if (EXP.some((w) => low.includes(w))) return "Explanation";
  if (INF.some((w) => low.includes(w))) return "Inference";
  if (OBS.some((w) => low.includes(w))) return "Observation";
  return "Observation";
}

function evidenceStrength(text: string): number {
  const hasPat = EVID.some((p) => p.test(text));
  const hasNum = /\d+/.test(text);
  if (hasPat && hasNum) return 0.85;
  if (hasPat) return 0.7;
  if (hasNum) return 0.3;
  return 0.1;
}

function edgeOf(src: Proposition, dst: Proposition): Edge {
  let support = 0.2 * src.evidence;
  let status: EdgeStatus = "UNKNOWN";
  if (src.type === "Observation" && (dst.type === "Inference" || dst.type === "Explanation")) {
    support = 0.6 * src.evidence;
    status = support > 0.4 ? "SUPPORT" : "WEAK_SUPPORT";
  } else if ((src.type === "Inference" || src.type === "Explanation") && dst.type === "Ontology") {
    support = 0.3 * src.evidence;
    status = support > 0.2 ? "WEAK_SUPPORT" : "UNSUPPORTED";
  }
  const need = dst.type === "Ontology" ? 0.95 : 0.7;
  return {
    src: src.idx,
    dst: dst.idx,
    status,
    support,
    gap: Math.max(0, need - support),
  };
}

export function analyzeClaims(text: string): { props: Proposition[]; edges: Edge[] } {
  const props = splitSentences(text).map((sentence, idx) => ({
    idx,
    text: sentence,
    type: classify(sentence),
    evidence: evidenceStrength(sentence),
  }));
  const edges: Edge[] = [];
  for (let i = 0; i < props.length; i++) {
    for (let j = 0; j < i; j++) edges.push(edgeOf(props[j]!, props[i]!));
  }
  return { props, edges };
}
