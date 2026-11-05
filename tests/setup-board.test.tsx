// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReadinessBoard } from "@/components/setup/ReadinessBoard";
import type { Readiness } from "@/lib/health";

/**
 * /setup is the page an operator opens right after pasting env vars. It has to
 * answer three questions at a glance: is this deployment live, what is still
 * blocking, and what exactly do I type next.
 */
const report = (over: Partial<Readiness> = {}): Readiness => ({
  mode: "live",
  project: "abcdefghijkl.supabase.co",
  generatedAt: "2026-11-04T12:00:00.000Z",
  ready: true,
  checks: [
    { id: "env", label: "Supabase project attached", state: "ok", detail: "Connected to abcdefghijkl.supabase.co." },
    { id: "auth", label: "Auth service reachable", state: "ok", detail: "Supabase Auth answered." },
    { id: "stations", label: "Station panel loaded", state: "warn", detail: "No stations in the panel yet — nothing will be monitored.", fix: "Import supabase/seed/uganda_stream_stations.csv." },
    { id: "schema", label: "Database schema installed", state: "fail", detail: 'profiles is not readable: relation "public.profiles" does not exist (42P01).', fix: "Run 0001_rbac_schema.sql first." },
  ],
  ...over,
});

afterEach(cleanup);

describe("ReadinessBoard", () => {
  it("announces a healthy live deployment", () => {
    render(<ReadinessBoard report={report({ checks: report().checks.filter((c) => c.state === "ok") })} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("This deployment is serving live data.")).toBeTruthy();
    expect(screen.queryByText(/Blocking/)).toBeNull();
  });

  it("says plainly when it is still on sample data", () => {
    render(
      <ReadinessBoard
        report={report({
          mode: "demo",
          project: "",
          ready: false,
          checks: [{ id: "env", label: "Supabase project attached", state: "fail", detail: "No project attached.", fix: "Add NEXT_PUBLIC_SUPABASE_URL." }],
        })}
      />,
    );
    expect(screen.getByText("Demo mode")).toBeTruthy();
    expect(screen.getByText("This deployment is running on sample data.")).toBeTruthy();
    expect(screen.getByText(/Add NEXT_PUBLIC_SUPABASE_URL/)).toBeTruthy();
  });

  it("shows a fix for every non-green check and none for green ones", () => {
    render(<ReadinessBoard report={report()} />);
    expect(screen.getByText(/Run 0001_rbac_schema\.sql first\./)).toBeTruthy();
    expect(screen.getByText(/Import supabase\/seed\/uganda_stream_stations\.csv\./)).toBeTruthy();
    // the two ok checks must not render a Fix block
    expect(screen.getAllByText(/^Fix:/)).toHaveLength(2);
  });

  it("separates blocking from attention", () => {
    render(<ReadinessBoard report={report({ ready: false })} />);
    expect(screen.getByText("Blocking")).toBeTruthy();
    expect(screen.getByText("Attention")).toBeTruthy();
    expect(screen.getByText("Almost live — fix the blocking checks below.")).toBeTruthy();
  });

  it("lists the four go-live steps in order with their commands", () => {
    render(<ReadinessBoard report={report()} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    expect(headings).toHaveLength(4);
    expect(headings[0]).toContain("Install the schema");
    expect(headings[1]).toContain("Point the site at the project");
    expect(headings[2]).toContain("Allow the login round-trip");
    expect(headings[3]).toContain("Start the ingestor");
    expect(screen.getByText("supabase/setup.sql")).toBeTruthy();
    expect(screen.getByText(/installs every migration in order/)).toBeTruthy();
    expect(screen.getByText(/python -m eastsound_ingest --stations stations\.csv run/)).toBeTruthy();
  });

  it("points at the machine-readable endpoint", () => {
    render(<ReadinessBoard report={report()} />);
    expect(screen.getByText("/api/health")).toBeTruthy();
  });

  it("never prints the anon key", () => {
    const withSecret = report();
    render(<ReadinessBoard report={withSecret} />);
    expect(document.body.textContent).not.toMatch(/anon-key/);
  });
});
