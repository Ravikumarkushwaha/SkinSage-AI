import Navbar from "@/components/DermNavbar";
import InfoCard from "@/components/InfoCard";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import {
  getDashboardSummary,
  type DashboardSummary,
  type DashboardActivityPoint,
  type DashboardConditionConfidence,
  type DashboardRecentCase,
} from "@/services/api";
import {
  Users,
  Brain,
  AlertTriangle,
  Cpu,
  Shield,
  Zap,
  TrendingUp,
  Activity,
} from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const EMPTY_WEEKLY_ACTIVITY: DashboardActivityPoint[] = [
  { day: "Mon", analyses: 0, flagged: 0 },
  { day: "Tue", analyses: 0, flagged: 0 },
  { day: "Wed", analyses: 0, flagged: 0 },
  { day: "Thu", analyses: 0, flagged: 0 },
  { day: "Fri", analyses: 0, flagged: 0 },
  { day: "Sat", analyses: 0, flagged: 0 },
  { day: "Sun", analyses: 0, flagged: 0 },
];

function StatTile({
  label,
  icon,
  value,
  suffix = "",
  accent,
  delay,
  reduceMotion,
}: {
  label: string;
  icon: ReactNode;
  value: number;
  suffix?: string;
  accent: "teal" | "amber" | "rose";
  delay: number;
  reduceMotion: boolean;
}) {
  const displayValue = useCountUp(value, { durationMs: 1200, reducedMotion: reduceMotion });
  const accentClass =
    accent === "amber"
      ? "border-[#f59e0b] text-[#f59e0b]"
      : accent === "rose"
      ? "border-[#f43f5e] text-[#f43f5e]"
      : "border-[#14b8a6] text-[#14b8a6]";

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.45, delay }}
      whileHover={reduceMotion ? undefined : { scale: 1.015 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      className="panel-surface p-6 relative overflow-hidden"
    >
      <div
        className={`absolute left-0 top-0 h-full w-[3px] ${
          accent === "amber" ? "bg-[#f59e0b]" : accent === "rose" ? "bg-[#f43f5e]" : "bg-[#14b8a6]"
        }`}
      />
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${accentClass} bg-black/20`}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-extrabold tracking-tight text-foreground">{displayValue}{suffix}</div>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}

function ActivityLineChart({
  reduceMotion,
  data,
}: {
  reduceMotion: boolean;
  data: DashboardActivityPoint[];
}) {
  const width = 560;
  const height = 220;
  const left = 40;
  const right = 20;
  const top = 20;
  const bottom = 28;
  const values = data.map((d) => d.analyses);
  const flagged = data.map((d) => d.flagged);
  const max = Math.max(...values, ...flagged) + 4;
  const spanX = width - left - right;
  const spanY = height - top - bottom;
  const barSlot = spanX / data.length;
  const barWidth = Math.min(24, barSlot * 0.42);
  const flaggedWidth = Math.max(6, barWidth * 0.36);
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "short" });
  const todayValue = data.find((d) => d.day === todayLabel)?.analyses ?? 0;

  const scaleHeight = (count: number) => {
    if (count <= 0) return 0;
    return Math.max(10, (count / max) * spanY);
  };

  return (
    <div>
      <div className="mb-2 text-xs text-muted-foreground">Today ({todayLabel}): {todayValue} analyses</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]">
        {Array.from({ length: 5 }).map((_, i) => {
          const y = top + (i / 4) * spanY;
          return <line key={i} x1={left} y1={y} x2={width - right} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" />;
        })}

        {data.map((d, i) => {
          const xCenter = left + barSlot * i + barSlot * 0.5;
          const analysisHeight = scaleHeight(d.analyses);
          const flaggedHeight = scaleHeight(d.flagged);
          const analysisY = top + (spanY - analysisHeight);
          const flaggedY = top + (spanY - flaggedHeight);
          const isToday = d.day === todayLabel;
          const showCount = d.analyses > 0;

          return (
            <g key={d.day}>
              <motion.rect
                x={xCenter - barWidth / 2}
                y={analysisY}
                width={barWidth}
                height={Math.max(1.5, analysisHeight)}
                rx={5}
                fill={isToday ? "#2dd4bf" : "#14b8a6"}
                initial={reduceMotion ? { height: Math.max(1.5, analysisHeight), y: analysisY } : { height: 0, y: top + spanY }}
                animate={{ height: Math.max(1.5, analysisHeight), y: analysisY }}
                transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : i * 0.06 }}
              />
              {showCount && (
                <text
                  x={xCenter}
                  y={analysisY - 6}
                  fill={isToday ? "#d1fae5" : "#9ffcf0"}
                  fontSize="10"
                  textAnchor="middle"
                >
                  {d.analyses}
                </text>
              )}
              <motion.rect
                x={xCenter - flaggedWidth / 2}
                y={flaggedY}
                width={flaggedWidth}
                height={Math.max(1.5, flaggedHeight)}
                rx={4}
                fill="#f59e0b"
                initial={reduceMotion ? { height: Math.max(1.5, flaggedHeight), y: flaggedY } : { height: 0, y: top + spanY }}
                animate={{ height: Math.max(1.5, flaggedHeight), y: flaggedY }}
                transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : i * 0.06 + 0.05 }}
              />

              <text x={xCenter} y={height - 8} fill={isToday ? "#d1fae5" : "hsl(196 16% 67%)"} fontSize="11" textAnchor="middle">
                {d.day}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ConfidenceBars({
  reduceMotion,
  data,
}: {
  reduceMotion: boolean;
  data: DashboardConditionConfidence[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data.length) {
    return <p className="text-sm text-muted-foreground">No confidence data yet. Run some analyses to populate this chart.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((item, idx) => (
        <div key={item.name} className="grid grid-cols-[110px_1fr] items-center gap-3">
          <span className="text-xs text-muted-foreground">{item.name}</span>
          <div className="relative h-5 rounded-full bg-white/8 overflow-visible">
            <motion.div
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
              className="h-full rounded-full bg-cyan-500/90"
              style={{ filter: hovered === idx ? "brightness(1.15)" : "brightness(1)" }}
              initial={reduceMotion ? { width: `${item.confidence}%` } : { width: 0 }}
              animate={{ width: `${item.confidence}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : idx * 0.08, ease: "easeOut" }}
            />
            {hovered === idx && (
              <motion.div
                initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                className="absolute -top-8 right-0 text-[11px] px-2 py-1 rounded-md border border-white/15 bg-[#0a1616] text-cyan-200"
              >
                {item.confidence}%
              </motion.div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { token, isReady } = useAuth();
  const reduceMotion = useReducedMotion();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!isReady) return;

    if (!token) {
      setSummary(null);
      setLoadError("Sign in to view your live dashboard metrics.");
      return;
    }

    // Function to fetch dashboard data
    const fetchDashboard = (isInitial = false) => {
      if (isInitial) {
        setLoading(true);
        setLoadError(null);
      }
      getDashboardSummary(token)
        .then((data) => {
          if (active) {
            setSummary(data);
            if (isInitial) setLoadError(null);
          }
        })
        .catch((err) => {
          if (!active) return;
          const message = err instanceof Error ? err.message : "Failed to load dashboard data.";
          if (isInitial) setLoadError(message);
        })
        .finally(() => {
          if (isInitial && active) setLoading(false);
        });
    };

    // Initial load
    fetchDashboard(true);

    // Poll for updates every 10 seconds to keep dashboard live
    const pollInterval = setInterval(() => fetchDashboard(false), 10000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [token, isReady]);

  const totals = summary?.totals ?? {
    patients_analyzed: 0,
    model_confidence_avg: 0,
    high_risk_cases_flagged: 0,
  };
  const riskBreakdown = summary?.risk_breakdown ?? {
    low: 0,
    medium: 0,
    high: 0,
  };
  const activityData = summary?.weekly_activity?.length ? summary.weekly_activity : EMPTY_WEEKLY_ACTIVITY;
  const confidenceData = summary?.confidence_by_condition ?? [];
  const recentCases: DashboardRecentCase[] = summary?.recent_cases ?? [];

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        {/* Header */}
        <motion.div
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Clinical Intelligence Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            {loading
              ? "Loading live metrics..."
              : loadError
              ? loadError
              : "Real-time overview of your SkinSage AI triage activity"}
          </p>
        </motion.div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
          <StatTile
            value={totals.patients_analyzed}
            label="Patients Analyzed"
            icon={<Users className="w-5 h-5" />}
            accent="teal"
            delay={0.1}
            reduceMotion={reduceMotion}
          />
          <StatTile
            value={Math.round(totals.model_confidence_avg)}
            suffix="%"
            label="Model Confidence Avg"
            icon={<Brain className="w-5 h-5" />}
            accent="teal"
            delay={0.2}
            reduceMotion={reduceMotion}
          />
          <StatTile
            value={riskBreakdown.low}
            label="Low Risk Cases"
            icon={<AlertTriangle className="w-5 h-5" />}
            accent="teal"
            delay={0.3}
            reduceMotion={reduceMotion}
          />
          <StatTile
            value={riskBreakdown.medium}
            label="Medium Risk Cases"
            icon={<AlertTriangle className="w-5 h-5" />}
            accent="amber"
            delay={0.35}
            reduceMotion={reduceMotion}
          />
          <StatTile
            value={riskBreakdown.high}
            label="High Risk Cases"
            icon={<AlertTriangle className="w-5 h-5" />}
            accent="rose"
            delay={0.4}
            reduceMotion={reduceMotion}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
          <motion.div
            initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.35 }}
            whileHover={reduceMotion ? undefined : { scale: 1.015 }}
            whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            className="panel-surface p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Weekly Analysis Activity</h2>
            </div>
            <ActivityLineChart key={JSON.stringify(activityData)} reduceMotion={reduceMotion} data={activityData} />
          </motion.div>

          <motion.div
            initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.4 }}
            whileHover={reduceMotion ? undefined : { scale: 1.015 }}
            whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            className="panel-surface p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Activity className="w-4 h-4 text-secondary" />
              <h2 className="text-sm font-semibold text-foreground">Model Confidence by Condition</h2>
            </div>
            <ConfidenceBars key={JSON.stringify(confidenceData)} reduceMotion={reduceMotion} data={confidenceData} />
          </motion.div>
        </div>

        {/* Recent Cases Table */}
        <motion.div
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.45 }}
          whileHover={reduceMotion ? undefined : { scale: 1.015 }}
          whileTap={reduceMotion ? undefined : { scale: 0.985 }}
          className="panel-surface p-6 mb-8"
        >
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Cases</h2>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px] pr-1 scrollbar-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border sticky top-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 z-10">
                  <th className="text-left py-3 px-2 font-medium">Case ID</th>
                  <th className="text-left py-3 px-2 font-medium">Condition</th>
                  <th className="text-left py-3 px-2 font-medium">Risk Level</th>
                  <th className="text-left py-3 px-2 font-medium">Confidence</th>
                  <th className="text-left py-3 px-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentCases.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 px-2 text-center text-muted-foreground">
                      No recent cases yet. Run analysis from the Analyze page to populate this table.
                    </td>
                  </tr>
                )}
                {recentCases.map((c) => (
                  <tr key={c.id} className="scan-row border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-2 font-mono text-primary text-xs">{c.id}</td>
                    <td className="py-3 px-2 text-foreground">{c.condition}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          c.risk === "High"
                            ? "bg-destructive/15 text-destructive"
                            : c.risk === "Medium"
                            ? "bg-warning/15 stat-orange"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {c.risk}
                      </span>
                    </td>
                    <td className="py-3 px-2 stat-blue font-semibold">{c.confidence == null ? "N/A" : `${c.confidence.toFixed(1)}%`}</td>
                    <td className="py-3 px-2 text-muted-foreground">{c.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <InfoCard
            title="AI Pipeline"
            description="Image → Feature Extraction → Clinical Reasoning → Risk Assessment. Multi-modal analysis with state-of-the-art vision models."
            icon={<Cpu className="w-5 h-5" />}
            delay={0.5}
          />
          <InfoCard
            title="Security & Compliance"
            description="End-to-end encrypted processing with HIPAA-compliant architecture. All patient data is anonymized and securely handled."
            icon={<Shield className="w-5 h-5" />}
            delay={0.55}
          />
          <InfoCard
            title="Performance"
            description="Average response latency under 2.1 seconds. Optimized inference pipeline with GPU-accelerated analysis."
            icon={<Zap className="w-5 h-5" />}
            delay={0.6}
          />
        </div>
      </div>
    </div>
  );
}
