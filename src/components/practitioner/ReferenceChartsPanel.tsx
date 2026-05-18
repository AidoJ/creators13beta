import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CHARTS = [
  {
    id: "summary",
    label: "Summary",
    title: "Cheat Sheet ~ 13 Creators Summary",
    image: "/charts/cheat-sheet-summary.jpg",
  },
  {
    id: "families",
    label: "Families",
    title: "Chart ~ Creator Families",
    image: "/charts/creator-families.jpg",
  },
  {
    id: "energies",
    label: "Energies",
    title: "Chart ~ Concentration of Energies",
    image: "/charts/concentration-of-energies.jpg",
  },
  {
    id: "shapes",
    label: "Shapes",
    title: "Chart ~ Creator Shapes",
    image: "/charts/creator-shapes.jpg",
  },
  {
    id: "roles",
    label: "Roles",
    title: "Chart ~ Bodies Families Roles",
    image: "/charts/bodies-families-roles.jpg",
  },
];

export default function ReferenceChartsPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-display font-bold text-foreground mb-4">Practitioner Reference Charts</h2>

      <Tabs defaultValue="summary">
        <TabsList className="grid grid-cols-5 w-full h-auto">
          {CHARTS.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="text-xs px-1">
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CHARTS.map((chart) => (
          <TabsContent key={chart.id} value={chart.id} className="mt-3">
            <h3 className="text-sm font-semibold text-foreground mb-3">{chart.title}</h3>
            <img
              src={chart.image}
              alt={chart.title}
              className={`w-full rounded-lg border border-border ${
                chart.id === "shapes" || chart.id === "roles" ? "rotate-90 origin-center my-[25%]" : ""
              }`}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
