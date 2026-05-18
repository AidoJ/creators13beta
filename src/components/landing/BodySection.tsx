import origBodyTemplate from "@/assets/orig-body-template.png";
import origBodyAlive1 from "@/assets/orig-body-alive-1.png";
import origBodyAlive2 from "@/assets/orig-body-alive-2.png";
import origWhatsBody1 from "@/assets/orig-whats-body-1.png";
import origWhatsBody2 from "@/assets/orig-whats-body-2.png";
import origWhatsBody3 from "@/assets/orig-whats-body-3.png";
import origWhatsBody4 from "@/assets/orig-whats-body-4.png";
import origWhatsBody5 from "@/assets/orig-whats-body-5.png";
import origWhatsBody6 from "@/assets/orig-whats-body-6.png";
import origWhatsBody7 from "@/assets/orig-whats-body-7.png";
import origWhatsSeHeader from "@/assets/orig-whats-see-header.png";
import origDividerSmall from "@/assets/orig-divider-small.png";

export function BodySection() {
  return (
    <section>
      {/* Your Body Is Your Template For Creation */}
      <div className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <div>
              <img
                src={origBodyTemplate}
                alt="Your body is your template for creation"
                className="w-full"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="text-center lg:text-left">
              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6 leading-tight">
                Your Body Is
                <br />
                <span className="text-primary">Your Template</span>
                <br />
                For Creation
              </h2>
              <div className="flex flex-wrap justify-center lg:justify-start gap-3">
                {["It's Physical", "It's Real", "It's In The Mirror"].map((text) => (
                  <span key={text} className="text-sm font-bold text-primary bg-primary/10 px-4 py-2 rounded-full">
                    {text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Make Your Body Come Alive */}
      <div className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <div className="text-center lg:text-left">
              <h2 className="text-5xl md:text-6xl font-display font-bold text-foreground leading-tight mb-8">
                Make<br />Your<br />Body<br />
                <span className="text-primary">Come<br />Alive</span>
              </h2>
              <div className="space-y-4 text-base text-muted-foreground max-w-sm">
                <p>You have a body, but do you have the user manual for your specific model?</p>
                <p>The shape, structure and features of your body form the template for everything you create.</p>
                <p>When you know how to operate your vehicle, you can create whatever your heart desires.</p>
              </div>
            </div>
            <div className="flex gap-4 justify-center">
              <img src={origBodyAlive1} alt="Body blueprint" className="w-[45%] object-cover" loading="lazy" decoding="async" />
              <img src={origBodyAlive2} alt="Body profile" className="w-[45%] object-cover" loading="lazy" decoding="async" />
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div>
        <img src={origDividerSmall} alt="" className="w-full block" loading="lazy" decoding="async" />
      </div>

      {/* What's To See In A Body */}
      <div className="py-20 bg-white">
        <div className="container mx-auto px-4 text-center">
          <img
            src={origWhatsSeHeader}
            alt="What's to see in a body"
            className="w-full max-w-4xl mx-auto mb-8"
            loading="lazy"
            decoding="async"
          />
          <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
            What's To See<br />In A Body?
          </h2>
          <div className="flex flex-wrap justify-center gap-3 mb-4">
            {["Bone Structure", "Weight Distribution", "Facial Features"].map((item) => (
              <span key={item} className="text-sm font-bold text-foreground border border-border px-5 py-2.5 rounded-full">
                {item}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground italic mb-10">
            Hint: The body's template mirrors the patterns in nature
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {[origWhatsBody1, origWhatsBody2, origWhatsBody3, origWhatsBody4].map((img, i) => (
              <img
                key={i}
                src={img}
                alt={`Body profiling example ${i + 1}`}
                className="w-full aspect-square object-cover"
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Additional body images row */}
      <div className="bg-white pb-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[origWhatsBody5, origWhatsBody6, origWhatsBody7].map((img, i) => (
              <img
                key={i}
                src={img}
                alt={`Body analysis ${i + 5}`}
                className="w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
