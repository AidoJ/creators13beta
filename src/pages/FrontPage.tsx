/**
 * Public front page. Sells only what the products table marks as visible on
 * the storefront — Face Profile, Clinic Profile and Owl are excluded by data,
 * not by wording. Practitioner training is application-gated, never buyable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolvePendingBuy, getPendingBuy, clearPendingBuy, rememberPendingBuy } from "@/lib/pendingPurchase";
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
  description: string | null;
  price_cents: number | null;
  currency: string | null;
  billing_shape: string | null;
  term_months: number | null;
  grants_level_key: string | null;
  storefront_placement: string;
  display_order: number;
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
    terms: "Then continues as Connect",
    feature: true,
    after: "continues",
    bullets: [
      "Everything in Connect",
      "Monthly live Zoom call: 13 Creators Q&A",
    ],
  },
  co_creator: {
    bird: "🦜",
    title: "Co-Create",
    terms: "Then continues as Connect",
    after: "continues",
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

// Membership order — must match supabase/functions/_shared/membership.ts.
const MEMBERSHIP_RANK: Record<string, number> = { taster: 1, creator: 2, co_creator: 3 };

interface FrontPageProps {
  shopMode?: boolean;
}

export default function FrontPage({ shopMode = false }: FrontPageProps) {
  const { user, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [path, setPath] = useState<PathKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [applyLevel, setApplyLevel] = useState<1 | 2 | 3 | null>(null);
  const [heldLevels, setHeldLevels] = useState<Set<string>>(new Set());
  const [showMobilePlay, setShowMobilePlay] = useState(true);

  useEffect(() => {
    supabase
      .from("products")
      .select("id, name, description, price_cents, currency, billing_shape, term_months, grants_level_key, storefront_placement, display_order")
      .eq("active", true)
      .eq("is_visible_on_storefront", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  const [levelNames, setLevelNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!user) return;
    supabase.from("access_levels").select("key, display_name").then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((l: any) => { m[l.key] = l.display_name; });
      setLevelNames(m);
    });
  }, [user]);

  // Mark held products for any signed-in visitor (front page and /shop).
  // A higher membership includes the lower ones (Connect < Create < Co-Create).
  useEffect(() => {
    if (!user) { setHeldLevels(new Set()); return; }
    loadMyAccess(user.id).then((items) => setHeldLevels(new Set(items.map((item) => item.level_key))));
  }, [user]);

  useEffect(() => {
    if (shopMode) return;
    const updateMobilePlay = () => setShowMobilePlay(window.scrollY < 32);
    updateMobilePlay();
    window.addEventListener("scroll", updateMobilePlay, { passive: true });
    return () => window.removeEventListener("scroll", updateMobilePlay);
  }, [shopMode]);

  // Main card per level: lowest display order wins, then oldest.
  const byLevel = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) {
      if (p.storefront_placement === "extra") continue;
      if (p.grants_level_key && !m[p.grants_level_key]) m[p.grants_level_key] = p;
    }
    return m;
  }, [products]);

  const extras = useMemo(() => products.filter((p) => p.storefront_placement === "extra"), [products]);

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
    if (error || (data as any)?.error) setHandingOff(false);
    // Forget the remembered choice only once checkout is confirmed (or the
    // product is already held), so a temporary failure never loses it.
    const forgetChoice = () => {
      clearPendingBuy();
      supabase.auth.updateUser({ data: { pending_buy: null, pending_buy_at: null } }).catch(() => {});
    };
    if (error || (data as any)?.error) {
      let body: any = data;
      try { if (!body && (error as any)?.context?.json) body = await (error as any).context.json(); } catch { /* ignore */ }
      const held = body?.error === "already_held";
      if (held) forgetChoice();
      toast({
        title: held ? "You already have this" : "Couldn't open payment",
        description: body?.message || error?.message || "Please try again.",
        variant: held ? "default" : "destructive",
      });
      return;
    }
    if ((data as any)?.free) {
      forgetChoice();
      navigate("/dashboard");
      return;
    }
    if ((data as any)?.url) {
      forgetChoice();
      window.location.href = (data as any).url as string;
    }
  }, [navigate]);

  // Buying needs an account, so a signed-out visitor signs up first and the
  // purchase resumes here automatically.
  const buy = useCallback((productId: string) => {
    if (!user) {
      rememberPendingBuy(productId);
      navigate(`/auth?mode=signup&returnTo=${encodeURIComponent(`/?buy=${productId}`)}`);
      return;
    }
    startCheckout(productId);
  }, [user, navigate, startCheckout]);

  // While a saved product choice is being resumed (e.g. straight after the
  // verification link), show a payment hand-off screen instead of the homepage.
  const [handingOff, setHandingOff] = useState<boolean>(() => {
    const h = typeof window !== "undefined" ? window.location.hash + window.location.search : "";
    const arrivingSignedIn = /access_token=|[?&]code=|type=signup/.test(h);
    return !!params.get("buy") || (!!getPendingBuy(null) && arrivingSignedIn);
  });
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setHandingOff(false); return; }
    // Signed in: keep the screen only if there really is a choice to resume.
    resolvePendingBuy(user).then((id) => { if (!id && !params.get("buy")) setHandingOff(false); else setHandingOff(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const [storedBuy, setStoredBuy] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setStoredBuy(null); return; }
    resolvePendingBuy(user).then(setStoredBuy);
  }, [user]);
  const pendingBuy = params.get("buy") ?? storedBuy;
  const resumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingBuy || !user) return;
    if (resumedRef.current === pendingBuy) return;
    resumedRef.current = pendingBuy;
    setStoredBuy(null);
    if (params.has("buy")) {
      const next = new URLSearchParams(params);
      next.delete("buy");
      setParams(next, { replace: true });
    }
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
    const rank = MEMBERSHIP_RANK[levelKey] ?? 0;
    const included = !heldLevels.has(levelKey) && rank > 0 &&
      Object.entries(MEMBERSHIP_RANK).some(([k, r]) => r > rank && heldLevels.has(k));
    const isHeld = heldLevels.has(levelKey) || included;
    // Upgrading: name the lower membership(s) that will end and be refunded.
    const replaced = isHeld ? [] : Object.entries(MEMBERSHIP_RANK)
      .filter(([k, r]) => r < rank && heldLevels.has(k))
      .map(([k]) => COPY[k]?.title ?? k);
    if (!product || !copy) return null;
    return (
      <div className={`relative flex flex-col rounded-3xl p-6 border ${isHeld ? "bg-secondary/10 border-2 border-secondary" : `bg-card ${copy.feature ? "border-2 border-primary shadow-lg" : "border-border"}`}`}>
        {isHeld && (
          <span className="absolute -top-3 left-6 rounded-full bg-secondary px-3 py-0.5 text-xs font-medium text-secondary-foreground">Your plan</span>
        )}
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
        {copy.after && product.billing_shape === "fixed_term" && (
          <p role="note" className="mb-3 text-xs text-foreground">
            {product.term_months ?? 13} monthly payments of A${(product.price_cents / 100).toFixed(0)}, then your plan
            continues as Connect at A${((byLevel.taster?.price_cents ?? 800) / 100).toFixed(0)} a month until you cancel.
          </p>
        )}
        {replaced.length > 0 && (
          <p role="note" className="mb-3 rounded-xl border border-banner-border bg-banner text-banner-foreground px-3 py-2 text-xs">
            Upgrading: your {replaced.join(" and ")} membership will end when you buy {copy.title}, and you'll be
            refunded for the unused part of this month.
          </p>
        )}
        <button
          onClick={() => buy(product.id)}
          disabled={busyId === product.id || isHeld}
          className={`mt-auto rounded-full px-5 py-3 font-medium border-2 border-primary transition-colors ${
            isHeld
              ? "bg-secondary text-secondary-foreground border-secondary cursor-default"
              : copy.feature ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-card text-primary hover:bg-muted"
          }`}
        >
          {busyId === product.id ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : included ? "Included in your plan" : isHeld ? "You have this" : cta}
        </button>
      </div>
    );
  };

  if (handingOff) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="font-display text-xl">Taking you to payment...</p>
      </div>
    );
  }

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
        <h2 className="font-display text-3xl md:text-4xl text-center max-sm:text-left max-sm:max-w-[8rem]">I want to…</h2>
        <p className="text-center text-muted-foreground mb-7 max-sm:text-left max-sm:max-w-[8rem]">Pick one to jump straight there, or just scroll.</p>
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

      {/* Extras — admin-chosen products shown as their own cards */}
      {extras.length > 0 && (
        <section id="extras" className="border-t border-border py-14">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex gap-3 items-start mb-7">
              <span className="mt-2 h-6 w-5 flex-none bg-secondary" style={hexClip} />
              <h2 className="font-display text-3xl">Extras</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {extras.map((p) => {
                const held = !!p.grants_level_key && heldLevels.has(p.grants_level_key);
                const levelName = p.grants_level_key ? (levelNames[p.grants_level_key] || COPY[p.grants_level_key]?.title || p.grants_level_key) : null;
                return (
                  <div key={p.id} className="flex flex-col rounded-3xl bg-card p-6 border border-border">
                    <h3 className="font-display text-2xl text-foreground">{p.name}</h3>
                    <p className="text-lg font-semibold text-primary mt-2">{priceLabel(p)}</p>
                    {levelName && <p className="text-sm text-muted-foreground">Includes {levelName} access</p>}
                    {p.description && <p className="text-sm text-foreground mt-3 mb-6">{p.description}</p>}
                    <button
                      onClick={() => {
                        if (held) toast({ title: "You already have this access", description: `You already hold ${levelName}, which this product includes. You can still buy it.` });
                        buy(p.id);
                      }}
                      disabled={busyId === p.id}
                      className="mt-auto rounded-full px-5 py-3 font-medium border-2 border-primary bg-card text-primary hover:bg-muted"
                    >
                      {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Buy"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}


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
          <div className="grid md:grid-cols-2 gap-4">
            {LEVELS.filter((l) => l.level === 1).map((l) => (
              <div key={l.level} className="flex flex-col rounded-3xl bg-card p-6 border border-border">
                <h3 className="font-display text-2xl">Level {l.level}</h3>
                <p className="text-lg font-semibold text-primary mt-2">{l.price}</p>
                <p className="text-sm text-muted-foreground mb-4">{l.terms}</p>
                <ul className="space-y-2 mb-4 text-sm">
                  {l.bullets.map((b) => (
                    <li key={b} className="flex gap-2.5">
                      <span className="mt-1.5 h-2 w-2 flex-none bg-secondary" style={hexClip} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/prospectus" className="text-sm text-primary underline mb-6">Read the Practitioner Prospectus</Link>
                <button
                  onClick={() => setApplyLevel(1)}
                  className="mt-auto rounded-full px-5 py-3 font-medium border-2 border-primary bg-card text-primary hover:bg-muted"
                >
                  Apply for Level 1
                </button>
              </div>
            ))}
            <div className="flex flex-col rounded-3xl bg-card p-6 border border-border">
              <h3 className="font-display text-2xl">Level 2 &amp; Level 3</h3>
              <p className="text-sm text-muted-foreground mt-2 mb-4">
                Open by application to practitioners who have completed the previous level. Register your interest and we'll be in touch.
              </p>
              {LEVELS.filter((l) => l.level !== 1).map((l) => (
                <div key={l.level} className="mb-4">
                  <p className="font-semibold">Level {l.level} <span className="text-primary">· {l.price}</span></p>
                  <p className="text-xs text-muted-foreground mb-1">{l.terms}</p>
                  <ul className="space-y-1 text-sm">
                    {l.bullets.map((b) => (
                      <li key={b} className="flex gap-2.5">
                        <span className="mt-1.5 h-2 w-2 flex-none bg-secondary" style={hexClip} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button
                onClick={() => setApplyLevel(2)}
                className="mt-auto rounded-full px-5 py-3 font-medium border-2 border-primary bg-card text-primary hover:bg-muted"
              >
                Register interest
              </button>
            </div>
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
  className={`fixed right-3 bottom-4 sm:right-5 sm:bottom-5 z-50 w-20 sm:w-44 drop-shadow-xl transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${showMobilePlay ? "opacity-100" : "max-sm:opacity-0 max-sm:pointer-events-none"}`}
      >
        <img src={floatingGameButton.url} alt="" aria-hidden className="block h-auto w-full" />
      </Link>}

      <ApplyDialog level={applyLevel} onClose={() => setApplyLevel(null)} />
    </div>
  );
}
