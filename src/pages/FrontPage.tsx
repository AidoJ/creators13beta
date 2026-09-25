/**
 * Public front page. Sells only what the products table marks as visible on
 * the storefront — Face Profile, Clinic Profile and Owl are excluded by data,
 * not by wording. Practitioner training is application-gated, never buyable.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAppOrigin } from "@/lib/appOrigin";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import ApplyDialog from "@/components/frontpage/ApplyDialog";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { loadMyAccess } from "@/lib/accessSummary";
import floatingGameButton from "@/assets/community-icons/floating-game-button.png.asset.json";

interface Product {
  id: string;
  name: string;
  price_cents: number | null;
  currency: string | null;
  billing_shape: string | null;
  term_months: number | null;
  grants_level_key: string | null;
}

type PathKey = "community" | "profiling" | "practitioner";

const PATH_LABELS: Record<PathKey, string> = {
  community: "Joining the community",
  profiling: "Finding out my Creator Types",
  practitioner: "Becoming a practitioner",
};

/** Card copy, keyed by the access level each product grants. */
const COPY: Record<string, { bird?: string; title: string; terms: string; feature?: boolean; after?: string; bullets: string[] }> = {
  taster: {
    bird: "🕊️",
    title: "Connect",
    terms: "Cancel anytime",
    bullets: [
      "The Co-Creators community directory and map",
      "Members' projects and events",
    ],
  },
  creator: {
    bird: "🐤",
    title: "Create",
    terms: "Cancel anytime",
    feature: true,
    after: "After 13 months you move to Connect at A$8 a month.",
    bullets: [
      "Everything in Connect",
      "Monthly live Zoom call: 13 Creators Q&A",
    ],
  },
  co_creator: {
    bird: "🦜",
    title: "Co-Create",
    terms: "Cancel anytime",
    after: "After 13 months you move to Connect at A$8 a month.",
    bullets: [
      "Everything in Create",
      "Monthly live Zoom call: Co-Creator Jam",
      "Limited to 13 people per call",
    ],
  },
  profile_body: {
    title: "Body Profile",
    terms: "2 Creator Types",
    feature: true,
    bullets: [
      "Book with a certified practitioner",
      "Private 1-hour consultation, on Zoom or in person",
    ],
  },
  profile_adv_body: {
    title: "Advanced Body Profile",
    terms: "4 Creator Types",
    bullets: [
      "Book with a certified profiler",
      "Private 1-hour consultation, on Zoom or in person",
      "Detailed PDF body type assessment",
    ],
  },
};

const LEVELS = [
  {
    level: 1 as const,
    price: "A$200 a month",
    terms: "13 months · includes Create membership",
    bullets: [
      "Live online group mentoring, coursework and peer support",
      "1-day online immersion",
      "24 case studies required",
    ],
  },
  {
    level: 2 as const,
    price: "A$300 a month",
    terms: "13 months · includes Co-Create membership",
    bullets: ["Live online group mentoring", "1-day online immersion", "6 in-depth case studies required"],
  },
  {
    level: 3 as const,
    price: "A$400 a month",
    terms: "13 months · includes Co-Create membership",
    bullets: ["Live online group mentoring", "3-day in-person immersion", "Profiler's assessment"],
  },
];

function priceLabel(p: Product) {
  if (!p.price_cents) return "Free";
  const amount = `A$${(p.price_cents / 100).toFixed(0)}`;
  if (p.billing_shape === "recurring") return `${amount} a month`;
  if (p.billing_shape === "fixed_term") return `${amount} a month for ${p.term_months ?? 13} months`;
  return amount;
}

const hexClip = { clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)" };

interface FrontPageProps {
  shopMode?: boolean;
}

export default function FrontPage({ shopMode = false }: FrontPageProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [path, setPath] = useState<PathKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [applyLevel, setApplyLevel] = useState<1 | 2 | 3 | null>(null);
  const [heldLevels, setHeldLevels] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("products")
      .select("id, name, price_cents, currency, billing_shape, term_months, grants_level_key")
      .eq("active", true)
      .eq("is_visible_on_storefront", true)
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  useEffect(() => {
    if (!shopMode || !user) return;
    loadMyAccess(user.id).then((items) => setHeldLevels(new Set(items.map((item) => item.level_key))));
  }, [shopMode, user]);

  const byLevel = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) if (p.grants_level_key) m[p.grants_level_key] = p;
    return m;
  }, [products]);

  const startCheckout = useCallback(async (productId: string) => {
    setBusyId(productId);
    const origin = getAppOrigin();
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        product_id: productId,
        successUrl: `${origin}/dashboard?purchase=success`,
        cancelUrl: `${origin}/?purchase=canceled`,
      },
    });
    setBusyId(null);
    if (error || (data as any)?.error) {
      toast({
        title: "Couldn't open payment",
        description: (data as any)?.message || error?.message || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    if ((data as any)?.free) {
      navigate("/dashboard");
      return;
    }
    if ((data as any)?.url) window.location.href = (data as any).url as string;
  }, [navigate]);

  // Buying needs an account, so a signed-out visitor signs up first and the
  // purchase resumes here automatically.
  const buy = useCallback((productId: string) => {
    if (!user) {
      navigate(`/auth?returnTo=${encodeURIComponent(`/?buy=${productId}`)}`);
      return;
    }
    startCheckout(productId);
  }, [user, navigate, startCheckout]);

  const pendingBuy = params.get("buy");
  useEffect(() => {
    if (!pendingBuy || !user) return;
    const next = new URLSearchParams(params);
    next.delete("buy");
    setParams(next, { replace: true });
    startCheckout(pendingBuy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBuy, user]);

  function choosePath(p: PathKey) {
    const next = path === p ? null : p;
    setPath(next);
    if (next) document.getElementById(next)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const dim = (band: PathKey) => (path && path !== band ? "opacity-40" : "");

  const ProductCard = ({ levelKey, cta }: { levelKey: string; cta: string }) => {
    const product = byLevel[levelKey];
    const copy = COPY[levelKey];
    const isHeld = heldLevels.has(levelKey);
    if (!product || !copy) return null;
    return (
      <div className={`flex flex-col rounded-3xl bg-card p-6 border ${copy.feature ? "border-2 border-primary shadow-lg" : "border-border"}`}>
        {copy.bird && <div className="text-3xl leading-none mb-1">{copy.bird}</div>}
        <h3 className="font-display text-2xl text-foreground">{copy.title}</h3>
        <p className="text-lg font-semibold text-primary mt-2">{priceLabel(product)}</p>
        <p className="text-sm text-muted-foreground mb-4">{copy.terms}</p>
        <ul className="space-y-2 mb-6 text-sm">
          {copy.bullets.map((b) => (
            <li key={b} className="flex gap-2.5">
              <span className="mt-1.5 h-2 w-2 flex-none bg-secondary" style={hexClip} />
              <span className="text-foreground">{b}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={() => buy(product.id)}
          disabled={busyId === product.id || isHeld}
          className={`mt-auto rounded-full px-5 py-3 font-medium border-2 border-primary transition-colors ${
            isHeld
              ? "bg-muted text-muted-foreground border-border cursor-default"
              : copy.feature ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-card text-primary hover:bg-muted"
          }`}
        >
          {busyId === product.id ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : isHeld ? "You have this" : cta}
        </button>
        {copy.after && <p className="text-xs text-muted-foreground text-center mt-2">{copy.after}</p>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      {shopMode ? (
        <DashboardHeader email={user?.email} onSignOut={signOut} />
      ) : <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-2">
          <a href="#top" className="mr-auto flex items-center gap-2 font-display text-xl text-primary">
            <span className="h-7 w-6 bg-primary" style={hexClip} />13Creators
          </a>
          {(Object.keys(PATH_LABELS) as PathKey[]).map((k) => (
            <a
              key={k} href={`#${k}`}
              className={`hidden md:inline-block text-sm px-3 py-1.5 rounded-full ${
                path === k ? "bg-muted text-primary font-medium" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {k === "community" ? "Community" : k === "profiling" ? "Creator Types" : "Practitioner training"}
            </a>
          ))}
          <Link
            to={user ? "/dashboard" : "/auth"}
            className="text-sm px-4 py-1.5 rounded-full border-2 border-border hover:border-primary hover:text-primary"
          >
            {user ? "My dashboard" : "Sign in"}
          </Link>
        </div>
        {path && (
          <div className="bg-muted border-b border-border text-sm">
            <div className="max-w-6xl mx-auto px-6 py-2 flex flex-wrap gap-3 items-center">
              <span>You're looking at: <strong>{PATH_LABELS[path]}</strong></span>
              <button
                className="underline text-primary"
                onClick={() => { setPath(null); document.getElementById("top")?.scrollIntoView({ behavior: "smooth" }); }}
              >
                Show me everything
              </button>
            </div>
          </div>
        )}
      </header>}

      {/* Hero */}
      {!shopMode && <div id="top" className="text-center py-16 px-6 bg-gradient-to-b from-muted to-background">
        <h1 className="font-display text-4xl md:text-5xl max-w-[15ch] mx-auto mb-3">Discover the 13 Creator Types</h1>
        <p className="text-muted-foreground max-w-[46ch] mx-auto">
          Play the card game for free. Meet other Creators. Find out your own type — or train to profile others.
        </p>
      </div>}

      {/* Chooser */}
      {!shopMode && <div className="max-w-6xl mx-auto px-6 pt-10">
        <h2 className="font-display text-3xl md:text-4xl text-center">I want to…</h2>
        <p className="text-center text-muted-foreground mb-7">Pick one to jump straight there, or just scroll.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {([
            ["community", "Join the Co-Creators community", "Meet other Creators and join projects."],
            ["profiling", "Find out my Creator Types", "Be profiled by a practitioner."],
            ["practitioner", "Become a certified practitioner", "Train to profile others."],
          ] as [PathKey, string, string][]).map(([k, title, sub]) => (
            <button
              key={k} onClick={() => choosePath(k)}
              className={`text-left rounded-3xl p-6 border-2 transition-colors ${
                path === k ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-transparent hover:border-border"
              }`}
            >
              <span className="block font-display text-xl mb-1">{title}</span>
              <span className={`block text-sm ${path === k ? "opacity-90" : "text-muted-foreground"}`}>{sub}</span>
            </button>
          ))}
        </div>
      </div>}

      {shopMode && (
        <div id="top" className="max-w-6xl mx-auto px-6 pt-10">
          <h1 className="font-display text-4xl text-foreground">Shop</h1>
        </div>
      )}

      {/* Community */}
      <section id="community" className={`border-t border-border mt-12 py-14 transition-opacity ${dim("community")}`}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-3 items-start mb-2">
            <span className="mt-2 h-6 w-5 flex-none bg-secondary" style={hexClip} />
            <h2 className="font-display text-3xl">Join the Co-Creators community</h2>
          </div>
          <p className="text-muted-foreground max-w-[56ch] ml-9 mb-7">
            Meet the other Creators, find your people on the map, and join the projects being built together.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <ProductCard levelKey="taster" cta="Join Connect" />
            <ProductCard levelKey="creator" cta="Join Create" />
            <ProductCard levelKey="co_creator" cta="Join Co-Create" />
          </div>
        </div>
      </section>

      {/* Profiling */}
      <section id="profiling" className={`border-t border-border py-14 transition-opacity ${dim("profiling")}`}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-3 items-start mb-2">
            <span className="mt-2 h-6 w-5 flex-none bg-secondary" style={hexClip} />
            <h2 className="font-display text-3xl">Find out your Creator Types</h2>
          </div>
          <p className="text-muted-foreground max-w-[56ch] ml-9 mb-5">
            Three ways in. All of them end with a practitioner talking you through what your body type means.
          </p>
          <div className="flex flex-wrap gap-2 ml-9 mb-7 text-sm text-muted-foreground">
            {["1. Choose how", "2. Book your consultation", "3. Meet your practitioner", "4. Your types appear in your profile"].map((s) => (
              <span key={s} className="rounded-full border border-border bg-card px-3.5 py-1.5">{s}</span>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Case study — free, via the existing signup path */}
            <div className="flex flex-col rounded-3xl bg-card p-6 border border-border">
              <h3 className="font-display text-2xl">Body Profile</h3>
              <p className="text-lg font-semibold text-primary mt-2">Free</p>
              <p className="text-sm text-muted-foreground mb-4">2 Creator Types</p>
              <ul className="space-y-2 mb-6 text-sm">
                {["Volunteer as a case study for a trainee practitioner",
                  "You agree to your photos being viewed in class",
                  "Signed off by the trainer"].map((b) => (
                  <li key={b} className="flex gap-2.5">
                    <span className="mt-1.5 h-2 w-2 flex-none bg-secondary" style={hexClip} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/enroll?case_study=true"
                className="mt-auto rounded-full px-5 py-3 font-medium border-2 border-primary bg-card text-primary text-center hover:bg-muted"
              >
                Volunteer as a case study
              </Link>
            </div>
            <ProductCard levelKey="profile_body" cta="Book a body profile" />
            <ProductCard levelKey="profile_adv_body" cta="Book an advanced profile" />
          </div>
        </div>
      </section>

      {/* Practitioner */}
      <section id="practitioner" className={`border-t border-border py-14 transition-opacity ${dim("practitioner")}`}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-3 items-start mb-2">
            <span className="mt-2 h-6 w-5 flex-none bg-secondary" style={hexClip} />
            <h2 className="font-display text-3xl">Become a certified practitioner</h2>
          </div>
          <p className="text-muted-foreground max-w-[56ch] ml-9 mb-5">
            Weave the Creator Types into your own expertise. Each level runs for 13 months in a group of no more than 13, and every level is by application.
          </p>
          <div className="flex flex-wrap gap-2 ml-9 mb-7 text-sm text-muted-foreground">
            {["1. Apply", "2. We review", "3. Join the next intake", "4. Train for 13 months"].map((s) => (
              <span key={s} className="rounded-full border border-border bg-card px-3.5 py-1.5">{s}</span>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {LEVELS.map((l) => (
              <div key={l.level} className="flex flex-col rounded-3xl bg-card p-6 border border-border">
                <h3 className="font-display text-2xl">Level {l.level}</h3>
                <p className="text-lg font-semibold text-primary mt-2">{l.price}</p>
                <p className="text-sm text-muted-foreground mb-4">{l.terms}</p>
                <ul className="space-y-2 mb-6 text-sm">
                  {l.bullets.map((b) => (
                    <li key={b} className="flex gap-2.5">
                      <span className="mt-1.5 h-2 w-2 flex-none bg-secondary" style={hexClip} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setApplyLevel(l.level)}
                  className="mt-auto rounded-full px-5 py-3 font-medium border-2 border-primary bg-card text-primary hover:bg-muted"
                >
                  Apply for Level {l.level}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!shopMode && <footer className="border-t border-border py-12 pb-40 text-sm text-muted-foreground">
        <div className="max-w-6xl mx-auto px-6">
          <p>Still deciding? Play the card game first — it's free, and you can join anything else later.</p>
        </div>
      </footer>}

      {/* Floating play button */}
      {!shopMode && <Link
        to={user ? "/play" : "/enroll/signup?path=player&tier=wren&billing=monthly"}
        aria-label="Play now - free card game"
        className="fixed right-3 bottom-4 sm:right-5 sm:bottom-5 z-50 w-36 sm:w-44 drop-shadow-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <img src={floatingGameButton.url} alt="" aria-hidden className="block h-auto w-full" />
      </Link>}

      <ApplyDialog level={applyLevel} onClose={() => setApplyLevel(null)} />
    </div>
  );
}
