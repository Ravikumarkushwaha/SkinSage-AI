import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <AnimatedSwitch className={className} forwardedRef={ref} {...props} />
));

function AnimatedSwitch({
  className,
  forwardedRef,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
  className?: string;
  forwardedRef: React.ForwardedRef<React.ElementRef<typeof SwitchPrimitives.Root>>;
}) {
  const reduceMotion = useReducedMotion();
  const checked = Boolean((props as { checked?: boolean }).checked);

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
      ref={forwardedRef}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{ backgroundColor: checked ? "rgba(20,184,166,1)" : "rgba(107,114,128,0.65)" }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      />
      <SwitchPrimitives.Thumb asChild>
        <motion.span
          className="pointer-events-none relative z-10 block h-5 w-5 rounded-full bg-white shadow"
          initial={false}
          animate={{ x: checked ? 20 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
        />
      </SwitchPrimitives.Thumb>
    </SwitchPrimitives.Root>
  );
}
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
