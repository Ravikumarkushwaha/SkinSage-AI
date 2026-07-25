import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/DermNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !username.trim() || !password) {
      setError("Email, username and password required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), username.trim(), password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
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
          <div className="badge-aurora inline-flex mb-4">Join SkinSage AI</div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg gradient-btn flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold gradient-text">Create your account</span>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <motion.div whileHover={reduceMotion ? undefined : { scale: 1.015 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
              <Button type="submit" className="w-full gradient-btn" disabled={loading}>
                {loading ? "Creating account..." : "Sign up"}
              </Button>
            </motion.div>
          </form>
          <p className="mt-4 text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
