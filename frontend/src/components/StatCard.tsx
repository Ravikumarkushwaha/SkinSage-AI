import { motion } from "framer-motion";
import { ReactNode } from "react";

interface StatCardProps {
  value: string;
  label: string;
  icon: ReactNode;
  colorClass: string;
  glowClass: string;
  delay?: number;
}

export default function StatCard({ value, label, icon, colorClass, glowClass, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={`glass-card p-6 ${glowClass} hover:scale-[1.02] transition-transform duration-300`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass} bg-current/10`}
          style={{ backgroundColor: 'currentColor', opacity: 0.12 }}
        >
          <div className={colorClass}>{icon}</div>
        </div>
      </div>
      <div className={`text-3xl font-extrabold tracking-tight ${colorClass}`}>{value}</div>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}
