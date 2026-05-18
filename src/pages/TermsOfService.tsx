import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "Nature of Services",
    content: `Services provided are educational, coaching-based, and supportive in nature and may include discussions relating to psychosomatic wellbeing, emotional health, nervous system awareness, relationships, communication, personal development, sexuality and intimacy, embodiment practices, business management, and lifestyle guidance.`,
  },
  {
    title: "No Medical, Psychological, Legal or Financial Advice",
    content: `All content is provided for educational purposes only and does not constitute medical, psychological, psychiatric, legal, financial, nutritional, or healthcare advice.

Participation in services does not create a practitioner-client healthcare relationship. You are solely responsible for your physical, emotional, mental, financial, and relational wellbeing and should seek qualified professional support where appropriate.`,
  },
  {
    title: "No Emergency Support",
    content: `Services do not include crisis support or emergency care.

Messaging, voice notes, email support, or community access are not monitored continuously and must not be relied upon for urgent assistance.

If you are experiencing a medical or mental health emergency, contact emergency services or an appropriate crisis support provider immediately.`,
  },
  {
    title: "Results Disclaimer",
    content: `We make no guarantees regarding health outcomes, emotional outcomes, relationship outcomes, business success, income, financial results, or personal transformation.

All testimonials and examples are illustrative only.`,
  },
  {
    title: "Personal Responsibility",
    content: `You acknowledge that you are fully responsible for your own decisions, actions, interpretations, and results.

Participation in coaching and related services is voluntary and undertaken at your own risk.`,
  },
  {
    title: "Payments, Refunds & Cancellations",
    content: `Refunds are offered solely at our discretion unless otherwise required under Australian Consumer Law.

Missed sessions may be forfeited, late arrivals may shorten session time, and reasonable notice is required for cancellations or rescheduling.`,
  },
  {
    title: "Intellectual Property",
    content: `All content, materials, recordings, frameworks, and resources remain the intellectual property of A'Ha Ra.

Materials may not be copied, shared, reposted, distributed, sold, recorded, or reproduced without prior written consent.`,
  },
  {
    title: "Limitation of Liability",
    content: `To the fullest extent permitted by law, we are not liable for any loss, injury, damages, emotional distress, business losses, relationship outcomes, or decisions arising from participation in our services.`,
  },
  {
    title: "Governing Law",
    content: `These Terms are governed by the laws of Australia.`,
  },
  {
    title: "Acceptance",
    content: `By purchasing, accessing, or participating in our services, you acknowledge that you have read, understood, and agreed to these Terms and Disclaimer.`,
  },
  {
    title: "Privacy & Personal Information",
    content: `By using our services, you acknowledge and agree that we may collect, store, and use personal information reasonably necessary for service delivery, communication, administration, payment processing, program participation, and business operations.

Personal information will be handled in accordance with our Privacy Policy and applicable Australian privacy laws.

By participating in our services, you consent to the collection and use of your information for these purposes.

We take reasonable steps to protect personal information, however no online platform, communication method, or data transmission can be guaranteed to be completely secure.`,
  },
  {
    title: "Contact Information",
    content: `For privacy questions, data requests, or photo removal requests, please contact:

Privacy Administrator
Organisation Name: GoldenAge Foundation T/As 13CREATORS
Email: info@13creators.com
Website: www.13creators.com`,
  },
];

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate("/");
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold text-foreground">Terms of Service</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            GoldenAge Foundation T/As 13CREATORS
          </p>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1">
            Terms of Service
          </h2>
          <p className="text-sm text-muted-foreground">Effective Date: March 2026</p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          By accessing or participating in any coaching services, programs, courses, memberships,
          events, or digital content provided by 13CREATORS, you agree to the following terms.
        </p>

        <div className="space-y-8">
          {sections.map((s, i) => (
            <section key={i}>
              <h3 className="text-lg font-display font-semibold text-foreground mb-2">
                {s.title}
              </h3>
              {s.content.split("\n\n").map((para, pi) => (
                <p
                  key={pi}
                  className="text-sm text-muted-foreground leading-relaxed mb-2 whitespace-pre-line"
                >
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
