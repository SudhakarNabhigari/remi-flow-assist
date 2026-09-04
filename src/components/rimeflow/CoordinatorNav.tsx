import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/coordinator", label: "Overview" },
  { to: "/coordinator/evidence", label: "Evidence" },
  { to: "/coordinator/tests", label: "Acceptance tests" },
] as const;

export function CoordinatorNav() {
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-primary text-primary-foreground shadow-sm" }}
          inactiveProps={{ className: "bg-card text-foreground/70 hover:bg-accent" }}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-all duration-200"
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
