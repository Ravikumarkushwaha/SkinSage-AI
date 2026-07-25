import {
  askChatbot,
  analyzeImageWithLLM,
  predictImage,
  getSessions,
  getSession,
  deleteSession,
  type ChatSessionSummary,
} from "@/services/api";

import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Navbar from "@/components/DermNavbar";

import {
  Upload, Send, MessageSquare, FileImage, Stethoscope,
  Loader2, History, Plus, Mic, Volume2, VolumeX,
  AlertTriangle, Pill, ShieldAlert, DollarSign, ShieldCheck, ArrowRight, Trash2,
} from "lucide-react";

interface Message {
  role: "user" | "ai";
  text: string;
}

interface DermResponse {
  mode?: "chat" | "analysis" | "invalid";
  valid?: boolean;
  reason?: string;
  message?: string;
  assessment?: string;
  confidence_note?: string;
  sections?: {
    Treatment?: string[];
    Risk?: string[];
    Cost?: string[];
    Prevention?: string[];
    "Next Step"?: string[];
  };
  disclaimer?: string;
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null;
  start: () => void;
};

type BrowserSpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

const initialMessages: Message[] = [{
  role: "ai",
  text: JSON.stringify({
    mode: "chat",
    message: "Hello! Ask me anything about dermatology or upload a skin image for analysis.",
    assessment: "Hello! Ask me anything about dermatology or upload a skin image for analysis.",
    sections: {},
    disclaimer: "",
  }),
}];

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png"];

const SECTION_CONFIG: Record<string, { icon: React.ReactNode; border: string; text: string; bg: string }> = {
  Treatment:   { icon: <Pill className="w-3.5 h-3.5" />,      border: "border-teal-500/40",   text: "text-teal-400",   bg: "bg-teal-500/10" },
  Risk:        { icon: <ShieldAlert className="w-3.5 h-3.5" />, border: "border-red-500/40",    text: "text-red-400",    bg: "bg-red-500/10" },
  Cost:        { icon: <DollarSign className="w-3.5 h-3.5" />,  border: "border-yellow-500/40", text: "text-yellow-400", bg: "bg-yellow-500/10" },
  Prevention:  { icon: <ShieldCheck className="w-3.5 h-3.5" />, border: "border-blue-500/40",   text: "text-blue-400",   bg: "bg-blue-500/10" },
  "Next Step": { icon: <ArrowRight className="w-3.5 h-3.5" />,  border: "border-amber-500/40", text: "text-amber-300", bg: "bg-amber-500/10" },
};

function AiMessage({ text }: { text: string }) {
  let data: DermResponse;
  try {
    data = JSON.parse(text);
  } catch {
    return <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{text}</div>;
  }

  const mode = data.mode ?? (data.valid === false ? "invalid" : data.assessment ? "analysis" : "chat");

  if (mode === "invalid") {
    return (
      <div className="flex gap-3 items-start bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-100/90 leading-relaxed">{data.message}</p>
      </div>
    );
  }

  if (mode === "chat" && data.message) {
    return <p className="text-sm text-foreground/90 leading-relaxed">{data.message}</p>;
  }

  const hasSections = data.sections && Object.values(data.sections).some((arr) => arr && arr.length > 0);
  if (!hasSections) {
    return <p className="text-sm text-foreground/90 leading-relaxed">{data.assessment ?? data.message}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="bg-primary/10 border border-primary/30 rounded-xl px-3.5 py-2.5">
        <p className="text-sm text-primary font-medium leading-relaxed">Clinical note: {data.assessment}</p>
        {data.confidence_note && <p className="text-xs text-muted-foreground mt-1 italic">{data.confidence_note}</p>}
      </div>

      {Object.entries(data.sections ?? {}).map(([title, items]) => {
        if (!items || items.length === 0) return null;
        const cfg = SECTION_CONFIG[title] ?? { icon: null, border: "border-border", text: "text-muted-foreground", bg: "bg-muted/30" };
        return (
          <div key={title} className={`rounded-xl border p-3 ${cfg.bg} ${cfg.border}`}>
            <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>
              {cfg.icon}{title}
            </div>
            <ul className="flex flex-col gap-1.5">
              {items.map((item: string, idx: number) => (
                <li key={idx} className={`text-xs text-foreground/90 leading-relaxed pl-3 border-l-2 ${cfg.border}`}>{item}</li>
              ))}
            </ul>
          </div>
        );
      })}

      {data.disclaimer && (
        <p className="text-[11px] text-muted-foreground italic leading-relaxed border-l-2 border-border pl-3">
          Note: {data.disclaimer}
        </p>
      )}
    </div>
  );
}

export default function Analyze() {
  const { token, user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historySessions, setHistorySessions] = useState<ChatSessionSummary[]>([]);
  const [hoveredHistoryId, setHoveredHistoryId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [hoverDropzone, setHoverDropzone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const saveHistory = user?.settings?.save_history ?? true;
  const analysisMode = user?.settings?.analysis_mode ?? "balanced";
  const reduceMotion = useReducedMotion();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!token || !saveHistory) return;
    getSessions(token).then(setHistorySessions).catch(() => setHistorySessions([]));
  }, [token, saveHistory]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const loadSession = async (sessionId: string) => {
    if (!token || !saveHistory) return;
    const session = await getSession(token, sessionId);
    setMessages(session.messages.length
      ? session.messages.map((m) => ({ role: m.role as "user" | "ai", text: m.text }))
      : initialMessages);
    setCurrentSessionId(session.id);
  };

  const handleDeleteSession = async (sessionId: string, title: string) => {
    if (!token || !saveHistory || deletingSessionId) return;
    const ok = window.confirm(`Delete chat \"${title || "Chat Session"}\"? This cannot be undone.`);
    if (!ok) return;

    setDeletingSessionId(sessionId);
    try {
      await deleteSession(token, sessionId);
      setHistorySessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        startNewChat();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: JSON.stringify({ mode: "invalid", message: "Could not delete this chat right now. Please try again." }),
        },
      ]);
    } finally {
      setDeletingSessionId(null);
    }
  };

  const startNewChat = () => { setMessages(initialMessages); setCurrentSessionId(null); };

  const speakText = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    try {
      const data: DermResponse = JSON.parse(text);
      const speakable = (data.assessment || data.message || "").trim();
      if (!speakable) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speakable);
      u.lang = "en-US";
      u.onend = () => setIsSpeaking(false);
      u.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(u);
    } catch { /* non-JSON, skip TTS */ }
  };

  const handleSpeakToggle = () => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking || isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const latestAi = [...messages].reverse().find((m) => m.role === "ai");
    if (!latestAi) return;
    speakText(latestAi.text);
  };

  const handleVoiceInput = () => {
    const speechWindow = window as BrowserSpeechWindow;
    const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.onresult = (e) => setInput((p) => p ? p + " " + e.results[0][0].transcript : e.results[0][0].transcript);
    r.start();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type)) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRunAnalysis = async () => {
    if (!imageFile && !symptoms.trim()) return;
    setAnalyzing(true);
    let predictionText = "";
    let visionText = "";
    const systemNotes: string[] = [];

    if (imageFile) {
      try {
        const p = await predictImage(imageFile);
        predictionText = `Image prediction: ${p.label} (confidence: ${(p.confidence * 100).toFixed(1)}%).`;
        if (p.differential?.length) {
          const top = p.differential
            .slice(0, 2)
            .map((d) => `${d.label} (${(d.confidence * 100).toFixed(1)}%)`)
            .join(", ");
          predictionText += ` Differential considerations: ${top}.`;
        }
      } catch (err) {
        predictionText = "";
        const msg = err instanceof Error ? err.message : "CNN prediction unavailable";
        systemNotes.push(`CNN prediction unavailable: ${msg}.`);
      }

      try {
        const vision = await analyzeImageWithLLM(imageFile, symptoms.trim());
        if (vision.analysis.trim()) {
          visionText = `Image analysis (from AI review): ${vision.analysis.trim()}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Vision analysis unavailable";
        systemNotes.push(`Vision analysis unavailable: ${msg}.`);
      }
    }

    const question = [
      predictionText,
      visionText,
      symptoms.trim(),
      systemNotes.length ? `System notes: ${systemNotes.join(" ")}` : "",
      `Analysis mode preference: ${analysisMode}.`,
    ].filter(Boolean).join(" ");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setChatLoading(true);
    try {
      const authToken = saveHistory ? token : null;
      const { answer, session_id } = await askChatbot(
        question,
        authToken,
        saveHistory ? currentSessionId : null,
      );
      if (session_id) setCurrentSessionId(session_id);
      setMessages((prev) => [...prev, { role: "ai", text: answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", text: JSON.stringify({ mode: "invalid", message: "Could not reach the server. Please check your connection." }) }]);
    }
    setChatLoading(false);
    setAnalyzing(false);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setChatLoading(true);
    try {
      const authToken = saveHistory ? token : null;
      const { answer, session_id } = await askChatbot(
        `${userMessage} Analysis mode preference: ${analysisMode}.`,
        authToken,
        saveHistory ? currentSessionId : null,
      );
      if (session_id) setCurrentSessionId(session_id);
      setMessages((prev) => [...prev, { role: "ai", text: answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", text: JSON.stringify({ mode: "invalid", message: "Could not reach the server. Please check your connection." }) }]);
    }
    setChatLoading(false);
  };

  return (
    <div className="min-h-screen text-foreground premium-shell">
      <Navbar />
      <div className="flex h-[calc(100vh-72px)]">

        <aside className="w-[280px] bg-card/65 border-r border-border px-6 py-6 hidden lg:flex flex-col min-h-0 backdrop-blur-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <History className="w-4 h-4" />History
            </h3>
            <motion.button
              onClick={startNewChat}
              whileHover={reduceMotion ? undefined : { scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              className="rounded-full p-1.5 hover:bg-primary/10 transition-colors"
            >
              <Plus className="w-4 h-4 text-muted-foreground hover:text-primary" />
            </motion.button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-visible">
            {!saveHistory && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                History is disabled in Settings. Enable it to store conversations.
              </p>
            )}
            {saveHistory && historySessions.map((s) => {
              const active = currentSessionId === s.id;
              const isDeleting = deletingSessionId === s.id;
              return (
                <motion.div
                  key={s.id}
                  onHoverStart={() => setHoveredHistoryId(s.id)}
                  onHoverEnd={() => setHoveredHistoryId((prev) => (prev === s.id ? null : prev))}
                  whileHover={reduceMotion ? undefined : { scale: 1.015 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  className={`relative w-full rounded-xl transition overflow-hidden ${active ? "bg-primary/15 text-primary border border-primary/20" : "hover:bg-muted/70 text-muted-foreground border border-transparent"}`}
                >
                  <motion.span
                    className="absolute left-0 top-0 h-full w-[2px] bg-[#14b8a6]"
                    initial={false}
                    animate={active || hoveredHistoryId === s.id ? { scaleY: 1 } : { scaleY: 0 }}
                    style={{ originY: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                  />
                  <button
                    onClick={() => loadSession(s.id)}
                    disabled={isDeleting}
                    className="w-full text-left text-sm px-3 py-2 pr-10"
                  >
                    {s.title || "Chat Session"}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete chat"
                    onClick={() => handleDeleteSession(s.id, s.title || "Chat Session")}
                    disabled={isDeleting}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
                  >
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 p-5 md:p-8 overflow-hidden">
          <div className="mb-4 md:mb-6 rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl px-4 md:px-6 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">SkinSage AI Studio</p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">AI Dermatology Workbench</h1>
            <p className="text-sm text-muted-foreground mt-1">Run multimodal analysis with CNN + vision context and continue with specialist-style guidance.</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[calc(100%-108px)]">

            <motion.div className="panel-surface p-6 flex flex-col"
              whileHover={reduceMotion ? undefined : { scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
                <Stethoscope className="w-5 h-5" />Patient Analysis
              </h2>
              <motion.label
                className="relative border border-border rounded-2xl flex flex-col items-center justify-center p-6 cursor-pointer min-h-[180px] bg-muted/20 overflow-hidden"
                onHoverStart={() => setHoverDropzone(true)}
                onHoverEnd={() => setHoverDropzone(false)}
                animate={dragOver && !reduceMotion ? { scale: 1.02, backgroundColor: "rgba(20,184,166,0.08)", boxShadow: "0 0 24px rgba(20,184,166,0.22)" } : hoverDropzone ? { scale: 1, backgroundColor: "rgba(20,184,166,0.03)", boxShadow: "0 0 18px rgba(20,184,166,0.18)" } : { scale: 1, backgroundColor: "rgba(0,0,0,0)", boxShadow: "0 0 0 rgba(0,0,0,0)" }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 20 }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={() => setDragOver(false)}
              >
                <motion.svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  initial={false}
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={reduceMotion ? undefined : { duration: 10, repeat: Infinity, ease: "linear" }}
                >
                  <rect
                    x="1"
                    y="1"
                    width="98"
                    height="98"
                    rx="6"
                    ry="6"
                    fill="none"
                    stroke={dragOver || hoverDropzone ? "#14b8a6" : "rgba(173, 184, 198, 0.55)"}
                    strokeWidth="1.4"
                    strokeDasharray={hoverDropzone || dragOver ? "0" : "10 8"}
                  />
                </motion.svg>
                {imagePreview ? (
                  <img src={imagePreview} className="max-h-36 object-contain rounded-lg" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileImage className="w-10 h-10" />
                    <span className="text-xs">Upload skin image (JPG / PNG)</span>
                  </div>
                )}
                <input type="file" hidden accept={ACCEPTED_IMAGE_TYPES.join(",")} onChange={handleFileChange} />
              </motion.label>
              <textarea rows={3} placeholder="Describe symptoms (optional)..." value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="mt-5 w-full bg-card border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              <motion.button
                onClick={handleRunAnalysis}
                disabled={analyzing || (!imageFile && !symptoms.trim())}
                whileHover={reduceMotion ? undefined : { scale: 1.015 }}
                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                className="mt-5 animated-run-btn text-primary-foreground font-semibold py-2.5 rounded-xl flex justify-center items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzing ? (
                  <>
                    <motion.span
                      className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                      animate={reduceMotion ? undefined : { rotate: 360 }}
                      transition={reduceMotion ? undefined : { duration: 0.9, repeat: Infinity, ease: "linear" }}
                    />
                    Analyzing...
                  </>
                ) : <><Upload className="w-4 h-4" />Run Analysis</>}
              </motion.button>
            </motion.div>

            <motion.div
              className="panel-surface p-6 flex flex-col min-h-0"
              animate={reduceMotion ? undefined : { boxShadow: ["0 0 0 rgba(20,184,166,0)", "0 0 20px rgba(20,184,166,0.15)", "0 0 0 rgba(20,184,166,0)"] }}
              transition={reduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
              whileHover={reduceMotion ? undefined : { scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-secondary">
                <MessageSquare className="w-5 h-5" />AI Assistant
              </h2>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div key={i} initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.25 }}
                      className={`${msg.role === "user" ? "ml-auto max-w-[80%] px-4 py-2 rounded-2xl text-sm bg-primary text-primary-foreground shadow-lg" : "w-full"}`}>
                      {msg.role === "user" ? msg.text : (
                        <div className="bg-muted/45 border border-border/80 rounded-2xl px-4 py-3">
                          <AiMessage text={msg.text} />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {chatLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-2">
                    <span>AI is thinking</span>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          className="h-1.5 w-1.5 rounded-full bg-primary"
                          animate={reduceMotion ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                          transition={reduceMotion ? undefined : { duration: 0.8, repeat: Infinity, delay: dot * 0.12 }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-4 mt-3">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask something..."
                  className="flex-1 bg-card border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                <motion.button whileHover={reduceMotion ? undefined : { scale: 1.015 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }} onClick={handleVoiceInput} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
                  <Mic className={`w-4 h-4 ${listening ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                </motion.button>
                <motion.button
                  whileHover={reduceMotion ? undefined : { scale: 1.015 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                  onClick={handleSpeakToggle}
                >
                  {isSpeaking ? <VolumeX className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4 text-muted-foreground" />}
                </motion.button>
                <motion.button whileHover={reduceMotion ? undefined : { scale: 1.015 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }} onClick={handleSend} className="bg-primary text-primary-foreground p-2 rounded-xl hover:brightness-110 transition">
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}