import { Link, useLocation } from "react-router-dom";
import logo from "@/assets/13creators-logo.png";

export default function GlobalFooter() {
  const { pathname } = useLocation();
  // Hide the global footer on the immersive game routes so the play surface
  // gets the full viewport (especially on mobile, where the footer otherwise
  // forces page-level scrolling on top of the 100dvh board).
  if (pathname.startsWith("/play/")) return null;

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={logo} alt="13Creators" className="h-6 w-auto" loading="lazy" decoding="async" />
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
          <Link to="/privacy-policy" className="hover:text-foreground transition-colors whitespace-nowrap">
            Privacy Policy
          </Link>
          <Link to="/terms-of-service" className="hover:text-foreground transition-colors whitespace-nowrap">
            Terms of Service
          </Link>
          <a
            href="https://www.13creators.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors whitespace-nowrap"
          >
            www.13creators.com
          </a>
        </div>

        <p className="text-xs text-muted-foreground whitespace-nowrap">
          © {new Date().getFullYear()} 13Creators
        </p>
      </div>
    </footer>
  );
}
