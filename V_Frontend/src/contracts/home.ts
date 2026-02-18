export type DailyContract = {
  id: string;
  dayKey: string;
  status: "draft" | "active" | "completed" | "failed" | "expired";
  title: string;
  statement: string;
  why?: string;
  metric?: {
    name: string;
    operator: ">=" | "<=" | "==";
    target: number;
    unit: string;
  };
  progress?: {
    current: number;
    target: number;
    pct: number;
  };
  playbook?: Array<{
    id: string;
    label: string;
    route: "cook" | "eatout" | "either";
    payload?: any;
  }>;
};

export type HomeSummary = {
  meta?: any;
  header?: {
    title?: string;
    subtitle?: string | null;
    modeLabel?: string;
    streakDays?: number;
  };
  heroScore?: {
    value?: number;
    label?: string;
    statusWord?: string;
    description?: string;
    confidence?: number | null;
    onTrack?: { tier: string; label: string; score: number };
  };
  todaysFocus?: any;
  todayTotals?: any;
  suggestion?: any;
  recentLogs?: any;

  // ✅ ADD THIS
  dailyContract?: DailyContract | null;
};
