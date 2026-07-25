import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Dashboard from "./pages/Dashboard";
import Analyze from "./pages/Analyze";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
const queryClient = new QueryClient();

function PublicRoute({ children }: { children: JSX.Element }) {
  const { token, isReady } = useAuth();
  if (!isReady) return null;
  return token ? <Navigate to="/dashboard" replace /> : children;
}

function PrivateRoute({ children }: { children: JSX.Element }) {
  const { token, isReady } = useAuth();
  if (!isReady) return null;
  return token ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
      >
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/analyze" element={<PrivateRoute><Analyze /></PrivateRoute>} />
          <Route path="/report" element={<Navigate to="/analyze" replace />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <AppRoutes />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
