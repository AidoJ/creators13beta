import { Link } from "react-router-dom";
import logo from "@/assets/13creators-logo.png";

export default function GlobalFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="13Creators" className="h-7 w-auto" loading="lazy" decoding="async" />
        </Link>

        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link to="/privacy-policy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link to="/terms-of-service" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <a
            href="https://www.13creators.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            www.13creators.com
          </a>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} 13Creators
        </p>
      </div>
    </footer>
  );
}
