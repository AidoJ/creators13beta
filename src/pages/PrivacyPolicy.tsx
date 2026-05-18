import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "1. Introduction",
    content: `This Privacy Policy explains how GoldenAge Foundation T/As 13CREATORS ("we," "us," or "our") collects, uses, stores, and protects photographs submitted by participants as part of our training program.

Participants may voluntarily upload photographs that contain personally identifiable information, including images of their face or body. Because such images may identify an individual, they are treated as personal data under applicable privacy laws.

We process this information in accordance with applicable data protection regulations including the General Data Protection Regulation, the Australian Privacy Act 1988, and the Australian Privacy Principles, where applicable.`,
  },
  {
    title: "2. Types of Personal Data Collected",
    content: `Participants may voluntarily upload photographs that may contain identifiable personal information, including:`,
    list: [
      "Facial images",
      "Body images",
      "Physical characteristics that may identify an individual",
    ],
    after:
      "These photographs may constitute personal data and, in some circumstances, may also be considered biometric data where facial features clearly identify an individual. We only collect images that participants choose to upload.",
  },
  {
    title: "3. Voluntary Participation and Consent",
    content: `Uploading photographs to the training platform is voluntary.

By uploading photographs, participants acknowledge and consent to:`,
    list: [
      "The collection of their images",
      "The use of the images for training purposes",
      "Limited access by authorized participants and staff",
    ],
    after: `Participants should only upload photographs they are comfortable sharing within the training environment.

Consent may be withdrawn at any time by submitting a written request for removal.`,
  },
  {
    title: "4. Purpose of Data Processing",
    content: `Participant photographs are used solely for purposes related to the training program, including:`,
    list: [
      "Educational demonstrations",
      "Training discussions",
      "Instructor feedback and learning activities",
      "Monitoring participant progress within the program",
    ],
    after:
      "Photographs will not be used for marketing, advertising, promotional materials, or public display without separate explicit written consent.",
  },
  {
    title: "5. Legal Basis for Processing",
    content: `Where required by applicable law, the legal basis for processing participant photographs includes:`,
    list: [
      "Participant consent",
      "Legitimate educational interest in delivering the training program",
    ],
    after: "Participants may withdraw consent at any time.",
  },
  {
    title: "6. Access to Photos",
    content: `Access to participant photographs is strictly limited.

Photos may be viewed by:`,
    list: [
      "The training team and instructors",
      "Internal administrative staff responsible for managing the training platform",
      "Students currently enrolled in the same training program",
    ],
    after: `Participants are prohibited from copying, downloading, screenshotting, redistributing, or sharing images of other participants outside the training environment.

Violation of these rules may result in removal from the program.`,
  },
  {
    title: "7. Data Storage and Security",
    content: `Photographs are stored in a private and secured database accessible only to authorized internal administrative personnel.

Security measures may include:`,
    list: [
      "Restricted access controls",
      "Authentication requirements",
      "Secure hosting environments",
      "Monitoring and administrative oversight",
    ],
    after:
      "While we implement reasonable safeguards, no electronic storage system can be guaranteed to be completely secure.",
  },
  {
    title: "8. Data Retention and Deletion",
    content: `Participant photographs are retained only for the duration necessary to support the training program.

The training program lasts 13 months, after which all uploaded photographs will be permanently deleted from the system, with the exception of users who choose to continue using the platform for the continuation of their learning and communication with other profiled individuals.

Deletion will occur within a reasonable administrative timeframe after the completion of the program unless additional consent has been obtained for continued storage.`,
  },
  {
    title: "9. Right to Withdraw Consent and Request Removal",
    content: `Participants may request removal of their photographs at any time.

Requests must be submitted in writing to the program administrator. Once a valid request is received:`,
    list: [
      "The photographs will be removed from the system within a reasonable timeframe.",
      "The images will no longer be accessible to instructors or students.",
    ],
    after:
      "Removal cannot retroactively prevent images that were previously viewed during training activities.",
  },
  {
    title: "10. Participant Rights",
    content: `Depending on applicable privacy laws, participants may have the right to:`,
    list: [
      "Access their personal data",
      "Request correction of inaccurate information",
      "Withdraw consent",
      "Request deletion of personal data",
      "Restrict or object to certain forms of processing",
      "Lodge a complaint with a relevant data protection authority",
    ],
    after:
      "Requests relating to personal data may be submitted using the contact information listed below.",
  },
  {
    title: "11. International Data Transfers",
    content: `Data may be stored or processed in countries outside a participant's country of residence where technical infrastructure or service providers are located.

Where international transfers occur, we take reasonable steps to ensure appropriate safeguards are implemented to protect personal data in accordance with applicable privacy laws.`,
  },
  {
    title: "12. Third-Party Service Providers",
    content: `We may use third-party providers to host or support the training platform and database infrastructure.

These providers are contractually required to:`,
    list: [
      "Maintain appropriate security measures",
      "Process data only as instructed",
      "Comply with applicable privacy and data protection laws",
    ],
    after: "Participant data is not sold or rented to third parties.",
  },
  {
    title: "13. Intellectual Property and Image Ownership",
    content: `Participants retain ownership of the photographs they upload.

However, by uploading images to the training platform, participants grant the organization a limited, non-exclusive license to use the images solely for the purposes described in this Privacy Policy and within the training program.

This license automatically ends when the images are deleted from the system.`,
  },
  {
    title: "14. Misuse and Unauthorized Distribution",
    content: `Participants are strictly prohibited from copying, capturing screenshots, downloading, or redistributing images of other participants.

While we implement rules and safeguards, the organization cannot guarantee that participants will not misuse images once viewed.

Any misuse should be reported immediately and may result in disciplinary action or removal from the program.`,
  },
  {
    title: "15. Data Breach Procedures",
    content: `In the unlikely event of a data breach involving participant photographs, we will take reasonable steps to:`,
    list: [
      "Investigate the breach",
      "Contain and mitigate potential harm",
      "Notify affected individuals where required by applicable law",
      "Comply with relevant data breach notification regulations",
    ],
  },
  {
    title: "16. Children and Minors",
    content:
      "The training program is intended for participants who are 18 years of age or older. Individuals under 18 must not submit photographs without verifiable parental or guardian consent.",
  },
  {
    title: "17. Policy Updates",
    content:
      "This Privacy Policy may be updated periodically to reflect changes in legal requirements, operational practices, or security procedures. Where significant changes occur, participants will be notified through appropriate communication channels.",
  },
  {
    title: "18. Contact Information",
    content: `For privacy questions, data requests, or photo removal requests, please contact:

Privacy Administrator
GoldenAge Foundation T/As 13CREATORS
Email: info@13creators.com`,
  },
];

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate("/"); } }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold text-foreground">Privacy Policy</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            GoldenAge Foundation T/As 13CREATORS
          </p>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1">
            Privacy Policy – Participant Photo Data
          </h2>
          <p className="text-sm text-muted-foreground">Effective Date: March 2026</p>
        </div>

        <div className="space-y-8">
          {sections.map((s, i) => (
            <section key={i}>
              <h3 className="text-lg font-display font-semibold text-foreground mb-2">
                {s.title}
              </h3>
              {s.content.split("\n\n").map((para, pi) => (
                <p key={pi} className="text-sm text-muted-foreground leading-relaxed mb-2">
                  {para}
                </p>
              ))}
              {s.list && (
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2 mb-2">
                  {s.list.map((item, li) => (
                    <li key={li}>{item}</li>
                  ))}
                </ul>
              )}
              {s.after &&
                s.after.split("\n\n").map((para, pi) => (
                  <p key={`a${pi}`} className="text-sm text-muted-foreground leading-relaxed mb-2">
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
