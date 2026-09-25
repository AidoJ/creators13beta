import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useFeatures } from "@/hooks/useFeatures";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Leaf, Lock } from "lucide-react";

/** Page-level refusal for members whose access doesn't include a feature. Admins/trainers pass. */
export default function FeatureGate({ feature, title, children }: { feature: string; title: string; children: ReactNode }) {
  const { user } = useAuth();
  const { has, ready } = useFeatures();
  const [staff, setStaff] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setStaff((data || []).some((r) => r.role === "admin" || r.role === "trainer"));
    });
  }, [user]);

  if (!ready || staff === null) {
    return <div className="min-h-screen flex items-center justify-center"><Leaf className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (has(feature) || staff) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <Lock className="h-8 w-8 text-primary mx-auto" />
        <h1 className="font-display text-2xl text-foreground">{title} isn't included in your membership</h1>
        <p className="text-sm text-muted-foreground">Connect, Create and Co-Create memberships include this.</p>
        <div className="flex justify-center gap-3">
          <Button asChild variant="outline"><Link to="/community/dashboard">Back to Community</Link></Button>
          <Button asChild><Link to="/shop">See memberships</Link></Button>
        </div>
      </div>
    </div>
  );
}
