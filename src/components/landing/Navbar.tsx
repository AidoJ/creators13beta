import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "About", href: "#about" },
  { label: "Pricing", href: "#tiers" },
  { label: "Community", href: "#coming-soon" },
  { label: "Shop", href: "#coming-soon" },
  { label: "Games", href: "#coming-soon" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-primary/90 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto flex items-center justify-between h-14 px-4">
        <Link to="/" className="flex items-center gap-1.5">
          <span className="text-xl font-display font-bold text-primary">13</span>
          <span className="text-base font-display font-semibold text-white">Creators</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-white/60 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
          <Link to="/auth">
            <Button size="sm" className="rounded-full px-5 font-semibold text-sm">Get Started</Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-primary/95 border-b border-white/10 px-4 pb-4 space-y-3">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="block text-sm font-medium text-white/60 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <Link to="/auth" onClick={() => setMobileOpen(false)}>
            <Button size="sm" className="w-full rounded-full">Get Started</Button>
          </Link>
        </div>
      )}
    </nav>
  );
}
