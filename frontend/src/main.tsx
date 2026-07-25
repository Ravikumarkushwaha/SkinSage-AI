import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          background: "hsl(228 60% 6%)",
          color: "#e2e8f0",
          padding: 24,
          fontFamily: "Inter, sans-serif",
        }}>
          <h1 style={{ marginBottom: 16 }}>Something went wrong</h1>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");
root.style.minHeight = "100vh";

createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
