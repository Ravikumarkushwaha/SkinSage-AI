import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

type ThemeMode = "light" | "dark";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (nextTheme: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "dermai_theme";

const ThemeContext = createContext<ThemeContextType | null>(null);

function getInitialTheme(): ThemeMode {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage === "light" || fromStorage === "dark") {
    return fromStorage;
  }
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function applyThemeClass(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    const fromUser = user?.settings?.theme_mode;
    if (fromUser === "light" || fromUser === "dark") {
      setThemeState(fromUser);
    }
  }, [user?.settings?.theme_mode]);

  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (nextTheme: ThemeMode) => setThemeState(nextTheme),
      toggleTheme: () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
