import { motion } from "framer-motion";
import { Users, Gamepad2, ShoppingBag } from "lucide-react";

const sections = [
  {
    title: "Community",
    description: "Connect with fellow Creator Types. Share insights, ask questions, and grow together in a space built for body-type creators.",
    icon: Users,
  },
  {
    title: "Golden Games",
    description: "Gamified challenges and interactive experiences designed to deepen your understanding of the 13 forces of nature.",
    icon: Gamepad2,
  },
  {
    title: "Shop",
    description: "Physical and digital products to support your Creator Type journey — from training materials to branded merchandise.",
    icon: ShoppingBag,
  },
];

export function ComingSoonSection() {
  return (
    <section id="coming-soon" className="py-24 bg-card">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-primary font-body text-sm font-semibold uppercase tracking-[0.3em] mb-4">
            What's Next
          </p>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
            Coming Soon
          </h2>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            More branches of the Creator Types ecosystem are on their way.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {sections.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="group text-center p-10 rounded-2xl bg-background border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg"
            >
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-6 group-hover:bg-primary/20 transition-colors">
                <s.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground mb-3">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
              <span className="inline-block mt-6 text-xs font-bold text-primary bg-primary/10 px-4 py-1.5 rounded-full uppercase tracking-wider">
                Coming Soon
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
