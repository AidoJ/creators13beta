import { Link } from "react-router-dom";
import origAharaInfo from "@/assets/orig-ahara-info.png";
import origFooterFinal from "@/assets/orig-footer-final.png";
import origReadyBg from "@/assets/orig-ready-bg.png";
import origFooterBg from "@/assets/orig-footer-bg.png";

export function Footer() {
  return (
    <footer>
      {/* Create & Come Alive + A'HaRa info */}
      <div className="relative bg-foreground text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <p className="text-base font-display uppercase tracking-widest text-white/80 mb-1">
              Create & Come Alive
            </p>
            <p className="text-sm font-display tracking-wider text-white/60">
              with{" "}
              <span className="text-red-500">C</span>
              <span className="text-orange-400">R</span>
              <span className="text-green-500">E</span>
              <span className="text-purple-500">A</span>
              <span className="text-yellow-400">T</span>
              <span className="text-blue-400">O</span>
              <span className="text-red-500">R</span>
              {" "}TYPES
            </p>
          </div>

          {/* A'HaRa info image from original */}
          <div className="max-w-3xl mx-auto mb-12">
            <img src={origAharaInfo} alt="A'HaRa — Creator Types founder info" className="w-full" loading="lazy" decoding="async" />
          </div>

          <div className="text-center space-y-2 text-sm text-white/60">
            <p><span className="text-white/90 font-semibold">Full Name:</span> A'HaRa</p>
            <p><span className="text-white/90 font-semibold">Creator Blueprint:</span> Lava / Whirlwind / Tree / Mountain</p>
            <p><span className="text-white/90 font-semibold">Mission:</span> To exit the sim we are in</p>
            <p><span className="text-white/90 font-semibold">Known For:</span> Blueprinting bodies, inner earth transmissions, timeline jumps, cosmic chats</p>
            <p><span className="text-white/90 font-semibold">Current Location:</span> Victoria, Australia</p>
            <a
              href="http://www.creatortypes.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-primary font-semibold hover:text-primary/80 transition-colors"
            >
              Creator Types For Business →
            </a>
          </div>
        </div>
      </div>

      {/* Footer images from original */}
      <div>
        <img src={origFooterBg} alt="" className="w-full block" loading="lazy" decoding="async" />
      </div>

      {/* Bottom bar */}
      <div className="bg-foreground py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-display font-bold text-primary">13</span>
              <span className="text-lg font-display font-semibold text-white">Creators</span>
            </div>
            <div className="flex gap-8 text-sm text-white/50">
              <a href="#about" className="hover:text-white transition-colors">About</a>
              <a href="#tiers" className="hover:text-white transition-colors">Pricing</a>
              <Link to="/auth" className="hover:text-white transition-colors">Sign In</Link>
            </div>
            <p className="text-xs text-white/30">
              © {new Date().getFullYear()} Creator Types. All rights reserved.
              <span className="ml-2">
                <a href="http://www.earthdreaming.com.au/" target="_blank" rel="noopener noreferrer" className="hover:text-white/50">
                  Photos by Earth Dreaming
                </a>
              </span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
