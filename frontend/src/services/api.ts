// In dev, use Vite proxy (/api -> backend). Override with VITE_API_URL for production.
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

function getAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Wraps fetch to catch network errors (e.g. backend not running) and return safe JSON. */
async function apiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "Failed to fetch" || msg.includes("Load failed") || msg.includes("NetworkError")) {
      throw new Error(
        "Cannot connect to the server. Make sure the backend is running (e.g. uvicorn from project root on port 8000)."
      );
    }
    throw err;
  }
}

/** Parse JSON from response; on non-OK, throw with server detail or fallback. */
async function parseJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  const text = await res.text();
  let data: T & { detail?: string };
  try {
    data = JSON.parse(text) as T & { detail?: string };
  } catch {
    if (!res.ok) throw new Error(fallbackMessage);
    throw new Error("Invalid server response");
  }
  if (!res.ok) throw new Error(data.detail ?? fallbackMessage);
  return data as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface User {
  id: string;
  email: string;
  username: string;
  settings?: UserSettings;
}

export interface UserSettings {
  display_name: string;
  analysis_mode: "fast" | "balanced" | "detailed";
  voice_enabled: boolean;
  save_history: boolean;
  email_alerts: boolean;
  theme_mode: "light" | "dark";
}

export async function signup(email: string, username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await apiFetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  return parseJsonOrThrow<{ token: string; user: User }>(res, "Signup failed");
}

export async function login(emailOrUsername: string, password: string): Promise<{ token: string; user: User }> {
  const body: { password: string; email?: string; username?: string } = { password };
  if (emailOrUsername.includes("@")) body.email = emailOrUsername;
  else body.username = emailOrUsername;
  const res = await apiFetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<{ token: string; user: User }>(res, "Login failed");
}

export async function getMe(token: string): Promise<User> {
  const res = await apiFetch(`${BASE_URL}/auth/me`, {
    headers: getAuthHeaders(token),
  });
  const data = await parseJsonOrThrow<{ user: User }>(res, "Failed to load profile");
  return data.user;
}

export async function updateSettings(token: string, settings: Partial<UserSettings>): Promise<User> {
  const res = await apiFetch(`${BASE_URL}/auth/settings`, {
    method: "PUT",
    headers: getAuthHeaders(token),
    body: JSON.stringify(settings),
  });
  const data = await parseJsonOrThrow<{ user: User }>(res, "Failed to update settings");
  return data.user;
}

// ---------------------------------------------------------------------------
// Chat sessions (History)
// ---------------------------------------------------------------------------
export interface ChatSessionSummary {
  id: string;
  title: string;
  updated_at: string | null;
}

export interface ChatSession {
  id: string;
  title: string | null;
  messages: { role: string; text: string }[];
}

export interface DashboardTotals {
  patients_analyzed: number;
  model_confidence_avg: number;
  high_risk_cases_flagged: number;
}

export interface DashboardRiskBreakdown {
  low: number;
  medium: number;
  high: number;
}

export interface DashboardActivityPoint {
  day: string;
  analyses: number;
  flagged: number;
}

export interface DashboardConditionConfidence {
  name: string;
  confidence: number;
}

export interface DashboardRecentCase {
  id: string;
  condition: string;
  risk: "Low" | "Medium" | "High";
  confidence: number | null;
  time: string;
}

export interface DashboardSummary {
  totals: DashboardTotals;
  risk_breakdown: DashboardRiskBreakdown;
  weekly_activity: DashboardActivityPoint[];
  confidence_by_condition: DashboardConditionConfidence[];
  recent_cases: DashboardRecentCase[];
}

export async function getSessions(token: string): Promise<ChatSessionSummary[]> {
  const res = await apiFetch(`${BASE_URL}/chat/sessions`, {
    headers: getAuthHeaders(token),
  });
  const data = await parseJsonOrThrow<{ sessions?: ChatSessionSummary[] }>(res, "Failed to load history");
  return data.sessions ?? [];
}

export async function getSession(token: string, sessionId: string): Promise<ChatSession> {
  const res = await apiFetch(`${BASE_URL}/chat/sessions/${sessionId}`, {
    headers: getAuthHeaders(token),
  });
  return parseJsonOrThrow<ChatSession>(res, "Failed to load conversation");
}

export async function createSession(token: string): Promise<ChatSession> {
  const res = await apiFetch(`${BASE_URL}/chat/sessions`, {
    method: "POST",
    headers: getAuthHeaders(token),
  });
  return parseJsonOrThrow<ChatSession>(res, "Failed to create conversation");
}

export async function deleteSession(token: string, sessionId: string): Promise<void> {
  const res = await apiFetch(`${BASE_URL}/chat/sessions/${sessionId}`, {
    method: "DELETE",
    headers: getAuthHeaders(token),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, "Failed to delete conversation");
}

export async function getDashboardSummary(token: string): Promise<DashboardSummary> {
  const timezoneOffset = String(new Date().getTimezoneOffset());
  const res = await apiFetch(`${BASE_URL}/dashboard/summary`, {
    headers: {
      ...getAuthHeaders(token),
      "X-Timezone-Offset-Minutes": timezoneOffset,
    },
  });
  return parseJsonOrThrow<DashboardSummary>(res, "Failed to load dashboard summary");
}

// ---------------------------------------------------------------------------
// Predict & Chat
// ---------------------------------------------------------------------------
export interface PredictResult {
  label: string;
  confidence: number;
  /** Other likely conditions (differential) from the CNN */
  differential?: { label: string; confidence: number }[];
}

export async function predictImage(file: File): Promise<PredictResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch(`${BASE_URL}/predict`, {
    method: "POST",
    body: formData,
  });
  const text = await response.text();
  let data: PredictResult & { error?: string; detail?: string };
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || "Prediction failed");
  }
  if (!response.ok) {
    const msg = (data.detail ?? data.error ?? text) || "Prediction failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (data.error) throw new Error(data.error);
  return {
    label: data.label,
    confidence: data.confidence,
    differential: data.differential,
  };
}

/** Analyze skin image with LLM vision (Groq). Returns clinical-style text for RAG. */
export async function analyzeImageWithLLM(
  file: File,
  symptoms: string = ""
): Promise<{ analysis: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("symptoms", symptoms);
  const response = await apiFetch(`${BASE_URL}/analyze-image`, {
    method: "POST",
    body: formData,
  });
  const text = await response.text();
  let data: { analysis?: string; detail?: string };
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || "Image analysis failed");
  }
  if (!response.ok) {
    const msg = (data.detail ?? text) || "Image analysis failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return { analysis: data.analysis ?? "" };
}

// ---------------------------------------------------------------------------
// Chatbot
// ---------------------------------------------------------------------------
export async function askChatbot(
  question: string,
  token: string | null = null,
  sessionId: string | null = null
): Promise<{ answer: string; session_id?: string }> {
  const body: { question: string; session_id?: string } = { question };
  if (sessionId) body.session_id = sessionId;
  const response = await apiFetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<{ answer: string; session_id?: string }>(response, "Chat failed");
}
