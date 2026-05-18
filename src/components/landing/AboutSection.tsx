import origSandDivider from "@/assets/orig-sand-divider.png";
import origBodyTypesBanner from "@/assets/orig-body-types-banner.png";

export function AboutSection() {
  return (
    <section id="about">
      {/* Sand divider with icons - full width image from original */}
      <div>
        <img src={origSandDivider} alt="" className="w-full block" loading="lazy" decoding="async" />
      </div>

      {/* Want To Meet Your Co-Creators */}
      <div className="py-16 bg-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground">
            Want To Meet Your Co-Creators?
          </h2>
        </div>
      </div>

      {/* Sand divider again */}
      <div>
        <img src={origSandDivider} alt="" className="w-full block" loading="lazy" decoding="async" />
      </div>

      {/* YouTube embed */}
      <div className="py-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="aspect-video overflow-hidden shadow-2xl">
              <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/N_hAuOoWFjM"
                title="13 CREATOR TYPES In 12 Minutes"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 13 Body Types banner - original image */}
      <div className="bg-white">
        <div className="container mx-auto px-4 py-16 text-center">
          <img
            src={origBodyTypesBanner}
            alt="13 Body Types = 13 Forces of Nature = Unlimited Creative Power"
            className="w-full max-w-5xl mx-auto mb-8"
            loading="lazy"
            decoding="async"
          />
          <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-relaxed">
            <span className="text-primary">13 BODY TYPES</span>
            <br />
            = 13 Forces of Nature
            <br />
            = Unlimited Creative Power!
          </h2>
          <p className="text-base md:text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
            Doors open soon to the Creator Types ecosystem —
            <br />
            The only place online where you can meet other Creators by their body type
          </p>
        </div>
      </div>
    </section>
  );
}
