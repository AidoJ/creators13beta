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
import ResetPassword from "./pages/ResetPassword";
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
import CardPreview from "./pages/CardPreview";
import Play from "./pages/Play";
import PlayDashboard from "./pages/PlayDashboard";
import JoinMatch from "./pages/JoinMatch";
import Lobby from "./pages/Lobby";
import ProfileWizard from "./pages/onboarding/ProfileWizard";
import CommunitySettings from "./pages/settings/CommunitySettings";
import ContactSettings from "./pages/settings/ContactSettings";
import RequiresCompletedProfile from "@/components/RequiresCompletedProfile";
import GlobalFooter from "@/components/shared/GlobalFooter";
import ErrorBoundary from "@/components/ErrorBoundary";
const MemberProfile = lazy(() => import("./pages/member/MemberProfile"));
const CommunityDashboard = lazy(() => import("./pages/community/CommunityDashboard"));
const Connections = lazy(() => import("./pages/community/Connections"));
const CommunityEvents = lazy(() => import("./pages/community/CommunityEvents"));
const LotusPreview = import.meta.env.DEV
  ? lazy(() => import("./pages/_preview/LotusPreview"))
  : null;


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RecoveryRedirect />
          <div className="flex flex-col min-h-screen">
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/enroll" element={<PlanSelection />} />
                <Route path="/enroll/plan" element={<Navigate to="/enroll" replace />} />
                <Route path="/enroll/signup" element={<Signup />} />
                <Route path="/enroll/payment" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}><Payment /></Suspense>} />
                <Route path="/enroll/practitioner" element={<ProtectedRoute><PractitionerSelection /></ProtectedRoute>} />
                <Route path="/enroll/details" element={<Details />} />
                <Route path="/enroll/consent" element={<ProtectedRoute><Consent /></ProtectedRoute>} />
                <Route path="/enroll/photos" element={<ProtectedRoute><Photos /></ProtectedRoute>} />
                <Route path="/enroll/booking" element={<ProtectedRoute><Booking /></ProtectedRoute>} />
                <Route path="/onboarding/profile" element={<ProtectedRoute><ProfileWizard /></ProtectedRoute>} />
                <Route path="/settings/community" element={<ProtectedRoute><RequiresCompletedProfile><CommunitySettings /></RequiresCompletedProfile></ProtectedRoute>} />
                <Route path="/settings/contact" element={<ProtectedRoute><ContactSettings /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><RequiresCompletedProfile><Dashboard /></RequiresCompletedProfile></ProtectedRoute>} />
                <Route
                  path="/community/dashboard"
                  element={
                    <ProtectedRoute>
                      <RequiresCompletedProfile>
                        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
                          <CommunityDashboard />
                        </Suspense>
                      </RequiresCompletedProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/community/connections"
                  element={
                    <ProtectedRoute>
                      <RequiresCompletedProfile>
                        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
                          <Connections />
                        </Suspense>
                      </RequiresCompletedProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/community/events"
                  element={
                    <ProtectedRoute>
                      <RequiresCompletedProfile>
                        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
                          <CommunityEvents />
                        </Suspense>
                      </RequiresCompletedProfile>
                    </ProtectedRoute>
                  }
                />
                <Route path="/practitioner" element={<ProtectedRoute><RoleGuard allowedRoles={["practitioner", "trainee", "trainer"]}><PractitionerDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/trainer" element={<ProtectedRoute><RoleGuard allowedRoles={["trainer"]}><TrainerDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><RoleGuard allowedRoles={["trainer", "admin"]}><AdminDashboard /></RoleGuard></ProtectedRoute>} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/card-preview" element={<CardPreview />} />
                <Route path="/play" element={<ProtectedRoute><RequiresCompletedProfile><PlayDashboard /></RequiresCompletedProfile></ProtectedRoute>} />
                <Route path="/play/new" element={<RequiresCompletedProfile><ErrorBoundary><Play /></ErrorBoundary></RequiresCompletedProfile>} />
                <Route path="/play/m/:matchId" element={<ProtectedRoute><RequiresCompletedProfile><ErrorBoundary><Play /></ErrorBoundary></RequiresCompletedProfile></ProtectedRoute>} />
                <Route path="/play/join/:token" element={<JoinMatch />} />
                <Route path="/play/lobby/:matchId" element={<ProtectedRoute><RequiresCompletedProfile><Lobby /></RequiresCompletedProfile></ProtectedRoute>} />
                <Route
                  path="/member/:userId"
                  element={
                    <ProtectedRoute>
                      <RequiresCompletedProfile>
                        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
                          <MemberProfile />
                        </Suspense>
                      </RequiresCompletedProfile>
                    </ProtectedRoute>
                  }
                />
                {LotusPreview && (
                  <Route
                    path="/_preview/lotus"
                    element={
                      <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
                        <LotusPreview />
                      </Suspense>
                    }
                  />
                )}

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
