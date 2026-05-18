import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import PlanSelection from "./pages/enrollment/PlanSelection";
import Signup from "./pages/enrollment/Signup";
const Payment = lazy(() => import("./pages/enrollment/Payment"));
import PractitionerSelection from "./pages/enrollment/PractitionerSelection";
import Details from "./pages/enrollment/Details";
import Consent from "./pages/enrollment/Consent";
import Photos from "./pages/enrollment/Photos";
import Booking from "./pages/enrollment/Booking";
import PractitionerDashboard from "./pages/Practitioner";
import AdminDashboard from "./pages/Admin";
import TrainerDashboard from "./pages/Trainer";
import RoleGuard from "@/components/RoleGuard";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import GlobalFooter from "@/components/shared/GlobalFooter";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/enroll" element={<PlanSelection />} />
                <Route path="/enroll/plan" element={<Navigate to="/enroll" replace />} />
                <Route path="/enroll/signup" element={<Signup />} />
                <Route path="/enroll/payment" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}><Payment /></Suspense>} />
                <Route path="/enroll/practitioner" element={<ProtectedRoute><PractitionerSelection /></ProtectedRoute>} />
                <Route path="/enroll/details" element={<Details />} />
                <Route path="/enroll/consent" element={<ProtectedRoute><Consent /></ProtectedRoute>} />
                <Route path="/enroll/photos" element={<ProtectedRoute><Photos /></ProtectedRoute>} />
                <Route path="/enroll/booking" element={<ProtectedRoute><Booking /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/practitioner" element={<ProtectedRoute><RoleGuard allowedRoles={["practitioner", "trainee", "trainer"]}><PractitionerDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/trainer" element={<ProtectedRoute><RoleGuard allowedRoles={["trainer"]}><TrainerDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><RoleGuard allowedRoles={["trainer", "admin"]}><AdminDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
            <GlobalFooter />
          </div>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
