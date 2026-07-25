import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/DermNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export default function Login() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!emailOrUsername.trim() || !password) {
      setError("Email/username and password required.");
      return;
    }
    setLoading(true);
    try {
      await login(emailOrUsername.trim(), password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-12">
        <motion.div
          className="w-full max-w-md panel-surface p-7 rounded-3xl"
          whileHover={reduceMotion ? undefined : { scale: 1.015 }}
          whileTap={reduceMotion ? undefined : { scale: 0.985 }}
        >
          <div className="badge-aurora inline-flex mb-4">Secure Access</div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg gradient-btn flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold gradient-text">Sign in to SkinSage AI</span>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="emailOrUsername">Email or username</Label>
              <Input
                id="emailOrUsername"
                type="text"
                placeholder="you@example.com or username"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                className="mt-1"
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <motion.div whileHover={reduceMotion ? undefined : { scale: 1.015 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
              <Button type="submit" className="w-full gradient-btn" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </motion.div>
          </form>
          <p className="mt-4 text-sm text-muted-foreground text-center">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
