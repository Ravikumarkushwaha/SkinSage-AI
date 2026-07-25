import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, BarChart3, Settings, Stethoscope, History, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/analyze", label: "Analyze", icon: Stethoscope },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Navbar() {
  const location = useLocation();
  const { user, logout, isReady } = useAuth();
  const reduceMotion = useReducedMotion();

  return (
    <nav className="glass-navbar sticky top-0 z-50 h-[72px] flex items-center justify-between px-6 lg:px-10">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg gradient-btn flex items-center justify-center">
          <Activity className="w-5 h-5" />
        </div>
        <span className="text-xl font-bold tracking-tight gradient-text">
          SkinSage AI
        </span>
      </Link>

      <div className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <motion.div
              key={item.label}
              whileHover={reduceMotion ? undefined : { scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              className="relative"
            >
              <Link
                to={item.to}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-lg bg-primary/10 border border-primary/20"
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
        <span className="text-xs text-muted-foreground hidden sm:inline">System Online</span>
        {isReady && (
          user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-8 h-8 rounded-full bg-muted p-0 text-xs font-semibold text-foreground">
                  {user.username?.slice(0, 2).toUpperCase() || "DR"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/analyze" className="flex items-center gap-2 cursor-pointer">
                    <History className="w-4 h-4" />
                    History
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="flex items-center gap-2 text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link to="/signup">
                <Button className="gradient-btn" size="sm">Sign up</Button>
              </Link>
            </div>
          )
        )}
      </div>
    </nav>
  );
}
