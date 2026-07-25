import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Navbar from "@/components/DermNavbar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { UserSettings } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, SlidersHorizontal, Volume2, ShieldCheck, History, MoonStar, Check } from "lucide-react";

const DEFAULT_SETTINGS: UserSettings = {
  display_name: "",
  analysis_mode: "balanced",
  voice_enabled: true,
  save_history: true,
  email_alerts: false,
  theme_mode: "dark",
};

export default function Settings() {
  const { token, user, updateUserSettings } = useAuth();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);
  const [status, setStatus] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (user?.settings) {
      setSettings({ ...DEFAULT_SETTINGS, ...user.settings });
    }
  }, [user]);

  useEffect(() => {
    setSettings((prev) => ({ ...prev, theme_mode: theme }));
  }, [theme]);

  const save = async () => {
    if (!token) {
      setStatus("Sign in to save settings.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await updateUserSettings(settings);
      setStatus("Settings saved successfully.");
      setSavedPulse(true);
      setTimeout(() => setSavedPulse(false), 2000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-6xl px-6 lg:px-10 py-10">
        <motion.div
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel-surface p-8"
        >
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">SkinSage AI Settings</h1>
              <p className="mt-2 text-muted-foreground">Tune analysis behavior, voice output, and privacy controls.</p>
            </div>
            <div className="relative">
              <motion.span
                className="absolute inset-0 rounded-full border border-[#14b8a6]/55"
                animate={reduceMotion ? undefined : { scale: [1, 1.15, 1], opacity: [1, 0, 1] }}
                transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="badge-aurora relative">Live Profile</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <motion.section
              className="panel-subtle p-5"
              whileHover={reduceMotion ? undefined : { scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            >
              <h2 className="text-sm font-semibold tracking-wide text-foreground mb-4 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Analysis
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>Analysis mode</Label>
                  <Select
                    value={settings.analysis_mode}
                    onValueChange={(v: "fast" | "balanced" | "detailed") =>
                      setSettings((s) => ({ ...s, analysis_mode: v }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select analysis mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast">Fast (shorter guidance)</SelectItem>
                      <SelectItem value="balanced">Balanced (recommended)</SelectItem>
                      <SelectItem value="detailed">Detailed (deeper reasoning)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </motion.section>

            <motion.section
              className="panel-subtle p-5"
              whileHover={reduceMotion ? undefined : { scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            >
              <h2 className="text-sm font-semibold tracking-wide text-foreground mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Experience
              </h2>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Volume2 className="w-4 h-4 text-primary" />
                    Voice responses
                  </div>
                  <Switch
                    checked={settings.voice_enabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, voice_enabled: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <History className="w-4 h-4 text-primary" />
                    Save conversation history
                  </div>
                  <Switch
                    checked={settings.save_history}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, save_history: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <MoonStar className="w-4 h-4 text-primary" />
                    Dark mode
                  </div>
                  <Switch
                    checked={settings.theme_mode === "dark"}
                    onCheckedChange={(v) => {
                      const mode = v ? "dark" : "light";
                      setSettings((s) => ({ ...s, theme_mode: mode }));
                      setTheme(mode);
                    }}
                  />
                </div>
              </div>
            </motion.section>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <motion.div whileHover={reduceMotion ? undefined : { scale: 1.015 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
              <Button
                className={`gradient-btn relative overflow-hidden ${savedPulse ? "ring-2 ring-[#14b8a6]/70" : ""}`}
                onClick={save}
                disabled={saving}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {savedPulse ? (
                    <motion.span key="check" initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.85 }} className="inline-flex mr-2">
                      <Check className="w-4 h-4" />
                    </motion.span>
                  ) : (
                    <motion.span key="save" initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.85 }} className="inline-flex mr-2">
                      <Save className="w-4 h-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
                {saving ? "Saving..." : "Save settings"}
                {savedPulse && <span className="absolute inset-0 bg-[#14b8a6]/20" aria-hidden />}
              </Button>
            </motion.div>
            {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
