import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

interface InfoCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  delay?: number;
}

export default function InfoCard({ title, description, icon, delay = 0 }: InfoCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : delay }}
      whileHover={reduceMotion ? undefined : { scale: 1.015 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      className="glass-card p-6 hover:border-primary/20 transition-colors duration-300"
    >
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4 text-primary">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}
