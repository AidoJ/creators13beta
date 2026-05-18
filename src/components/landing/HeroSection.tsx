import { Link } from "react-router-dom";
import origCreatorFigure from "@/assets/orig-creator-figure.png";
import origIconsStrip from "@/assets/orig-icons-strip.png";
import origCreatorTypesText from "@/assets/orig-creator-types-text.png";
import origButtons from "@/assets/orig-buttons.png";
import heroBg1 from "@/assets/original-hero-bg.png";
import heroBg2 from "@/assets/original-hero-2.png";
import heroBg3 from "@/assets/original-hero-3.png";
import heroBg4 from "@/assets/original-hero-4.png";
import heroBg5 from "@/assets/original-hero-5.png";
import heroBg6 from "@/assets/original-hero-6.png";
import heroBg7 from "@/assets/original-hero-7.png";
import heroBg8 from "@/assets/original-hero-8.png";
import heroBg9 from "@/assets/original-hero-9.png";
import heroBg10 from "@/assets/original-hero-10.png";
import heroBg11 from "@/assets/original-hero-11.png";
import heroBg12 from "@/assets/original-hero-12.png";
import heroBg13 from "@/assets/original-hero-13.png";
import heroBg14 from "@/assets/original-hero-14.png";
import heroBg15 from "@/assets/original-hero-15.png";

export function HeroSection() {
  // The original site composites multiple layers. The main hero uses an ocean/sunset background
  // with the creator figure overlaid. We'll stack the key layers.
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#1a3a6a]">
      {/* Background layers - the original site stacks these as parallax/layered images */}
      {/* Main ocean/sunset background */}
      <div className="absolute inset-0">
        <img src={heroBg1} alt="" className="absolute inset-0 w-full h-full object-cover" decoding="async" />
      </div>
      {/* Additional overlay layers from original */}
      <img src={heroBg2} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-80" loading="lazy" decoding="async" />
      <img src={heroBg3} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-60" loading="lazy" decoding="async" />
      <img src={heroBg4} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-50" loading="lazy" decoding="async" />
      <img src={heroBg5} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40" loading="lazy" decoding="async" />
      <img src={heroBg6} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-30" loading="lazy" decoding="async" />
      <img src={heroBg7} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30" loading="lazy" decoding="async" />
      <img src={heroBg8} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-20" loading="lazy" decoding="async" />
      <img src={heroBg9} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-20" loading="lazy" decoding="async" />
      <img src={heroBg10} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-20" loading="lazy" decoding="async" />
      <img src={heroBg11} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-20" loading="lazy" decoding="async" />
      <img src={heroBg12} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-15" loading="lazy" decoding="async" />
      <img src={heroBg13} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-15" loading="lazy" decoding="async" />
      <img src={heroBg14} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-15" loading="lazy" decoding="async" />
      <img src={heroBg15} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-10" loading="lazy" decoding="async" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-4 pt-20 pb-8">
        {/* Creator figure */}
        <img
          src={origCreatorFigure}
          alt="Creator Blueprint figure"
          className="w-40 md:w-56 lg:w-64 mb-2"
        />

        {/* CREATOR text */}
        <h1 className="font-display font-bold leading-none mb-0">
          <span className="block text-5xl md:text-7xl lg:text-9xl text-white tracking-[0.15em]">
            CREATOR
          </span>
        </h1>

        {/* Blueprint in pink script */}
        <p className="text-4xl md:text-6xl lg:text-7xl text-pink-500 italic -mt-2 mb-6" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700 }}>
          Blueprint
        </p>

        {/* Icons strip */}
        <img
          src={origIconsStrip}
          alt="13 Creator Type icons"
          className="w-64 md:w-96 mb-6"
        />

        {/* CREATE + COME ALIVE tagline */}
        <div className="mb-6">
          <p className="text-base md:text-lg font-display uppercase tracking-[0.2em] font-bold text-white">
            Create + Come Alive
          </p>
          <p className="text-sm md:text-base font-display tracking-wider text-white/90 mt-1">
            with{" "}
            <span className="text-red-500 font-bold">C</span>
            <span className="text-orange-400 font-bold">R</span>
            <span className="text-green-500 font-bold">E</span>
            <span className="text-purple-500 font-bold">A</span>
            <span className="text-yellow-400 font-bold">T</span>
            <span className="text-blue-400 font-bold">O</span>
            <span className="text-red-500 font-bold">R</span>
            {" "}TYPES
          </p>
        </div>

        {/* CTA Buttons - matching original white rectangular style */}
        <div className="flex flex-col sm:flex-row gap-6">
          <Link
            to="/auth"
            className="bg-white text-pink-600 font-display font-bold text-lg uppercase tracking-wider px-12 py-5 hover:bg-white/90 transition-colors shadow-xl text-center leading-tight"
          >
            Get<br />Profiled
          </Link>
          <a
            href="#about"
            className="bg-white text-blue-700 font-display font-bold text-lg uppercase tracking-wider px-12 py-5 hover:bg-white/90 transition-colors shadow-xl text-center leading-tight"
          >
            Profile<br />Yourself
          </a>
        </div>
      </div>
    </section>
  );
}
