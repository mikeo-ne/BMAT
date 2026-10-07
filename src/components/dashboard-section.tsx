import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  Clock3,
  FileText,
  Headphones,
  Radio,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

type Section = "charts" | "monitor" | "cmo" | "stations" | "reports" | "settings";

const stations = [
  { name: "CBS FM", city: "Kampala", region: "Central", type: "FM", status: "Live", plays: 1482 },
  { name: "Galaxy FM", city: "Kampala", region: "Central", type: "FM", status: "Live", plays: 1260 },
  { name: "Radio Simba", city: "Kampala", region: "Central", type: "FM", status: "Live", plays: 1086 },
  { name: "Crooze FM", city: "Mbarara", region: "Western", type: "FM", status: "Live", plays: 724 },
  { name: "Nile Radio", city: "Gulu", region: "Northern", type: "FM", status: "Live", plays: 638 },
  { name: "Open Gate FM", city: "Jinja", region: "Eastern", type: "FM", status: "Live", plays: 517 },
];

const topTracks = [
  { title: "Nkwagala", artist: "Bebe Cool", spins: 2525, change: "+12.4%" },
  { title: "Tuli Kubigere", artist: "Eddy Kenzo", spins: 2242, change: "+8.1%" },
  { title: "Baliwa", artist: "Spice Diana ft. Jose Chameleone", spins: 1884, change: "+5.6%" },
  { title: "Onsanula", artist: "Winnie Nwagi", spins: 1549, change: "−2.3%" },
  { title: "Malaika", artist: "Jose Chameleone", spins: 1353, change: "+3.9%" },
];

const cmoRows = [
  { track: "Nkwagala", artist: "Bebe Cool", station: "CBS FM", region: "Central", timestamp: "10:42 AM", status: "Matched" },
  { track: "Tuli Kubigere", artist: "Eddy Kenzo", station: "Galaxy FM", region: "Central", timestamp: "10:36 AM", status: "Matched" },
  { track: "Baliwa", artist: "Spice Diana", station: "Crooze FM", region: "Western", timestamp: "10:21 AM", status: "Review" },
  { track: "Onsanula", artist: "Winnie Nwagi", station: "Open Gate FM", region: "Eastern", timestamp: "9:58 AM", status: "Matched" },
];

const statsBySection: Record<Section, { label: string; value: string; note: string; icon: LucideIcon }[]> = {
  charts: [
    { label: "Monitored spins", value: "124,580", note: "+12.5% this week", icon: Headphones },
    { label: "Tracks ranked", value: "342", note: "Across 24 stations", icon: BarChart3 },
    { label: "Reporting stations", value: "24 / 24", note: "Panel online", icon: Radio },
  ],
  monitor: [
    { label: "Stations online", value: "24 / 24", note: "All feeds healthy", icon: Radio },
    { label: "Tracks detected today", value: "1,286", note: "+6.2% vs yesterday", icon: Activity },
    { label: "Matched confidence", value: "98.7%", note: "Fingerprint quality", icon: Check },
  ],
  cmo: [
    { label: "Verified play logs", value: "18,492", note: "This reporting period", icon: ShieldCheck },
    { label: "Pending review", value: "12", note: "Needs a rights check", icon: Clock3 },
    { label: "Matched rate", value: "98.4%", note: "+1.8% this month", icon: Check },
  ],
  stations: [
    { label: "FM stations", value: "24", note: "Across 4 regions", icon: Radio },
    { label: "Coverage areas", value: "18", note: "Urban and regional", icon: Building2 },
    { label: "Panel uptime", value: "99.6%", note: "Last 30 days", icon: Activity },
  ],
  reports: [
    { label: "Reports ready", value: "16", note: "Updated this month", icon: FileText },
    { label: "Tracked plays", value: "68,214", note: "Across your catalogue", icon: Headphones },
    { label: "Regions covered", value: "4", note: "Nationwide panel", icon: UsersRound },
  ],
  settings: [
    { label: "Account status", value: "Verified", note: "Bebe Cool · Artist", icon: Check },
    { label: "Active alerts", value: "3", note: "Email and dashboard", icon: Activity },
    { label: "Connected feeds", value: "24", note: "Uganda FM panel", icon: Radio },
  ],
};

const copy: Record<Section, { eyebrow: string; title: string; description: string }> = {
  charts: { eyebrow: "NATIONAL AIRPLAY", title: "Uganda Top 40", description: "See the tracks moving the airwaves across Uganda's monitored FM stations." },
  monitor: { eyebrow: "BROADCAST INTELLIGENCE", title: "Live station monitor", description: "Station feed status and the most recent verified music detections." },
  cmo: { eyebrow: "RIGHTS & COMPLIANCE", title: "CMO audit portal", description: "Review matched play logs and reporting records for rights administration." },
  stations: { eyebrow: "PANEL DIRECTORY", title: "Monitored stations", description: "Explore the Uganda radio panel by station, city and broadcast region." },
  reports: { eyebrow: "INSIGHTS & EXPORTS", title: "Reports", description: "Airplay summaries and verified activity for your artist catalogue." },
  settings: { eyebrow: "PREFERENCES", title: "Workspace settings", description: "Manage your profile, delivery preferences and monitoring notifications." },
};

export function DashboardSection({ section }: { section: Section }) {
  const info = copy[section];
  const stats = statsBySection[section];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">{info.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{info.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{info.description}</p>
        </div>
        {section === "reports" && <Button variant="outline"><ArrowDownToLine className="h-4 w-4" /> Export summary</Button>}
        {section === "monitor" && <Badge variant="success"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> All systems live</Badge>}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${info.title} metrics`}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{stat.note}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-brand"><Icon className="h-5 w-5" /></span>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {section === "charts" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
          <Card>
            <CardHeader><CardTitle className="text-base">Top tracks this week</CardTitle><CardDescription>Verified spins across the Uganda FM panel.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {topTracks.map((track, index) => (
                <div key={track.title} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${index === 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{index + 1}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{track.title}</p><p className="truncate text-xs text-slate-500">{track.artist}</p></div>
                  <div className="text-right"><p className="text-sm font-bold tabular-nums text-slate-900">{formatNumber(track.spins)}</p><p className="text-[10px] font-semibold text-emerald-600">{track.change}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Regional share</CardTitle><CardDescription>Spin activity from all monitored regions.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {[{ name: "Central", percent: 48, color: "bg-violet-500" }, { name: "Eastern", percent: 21, color: "bg-emerald-500" }, { name: "Western", percent: 18, color: "bg-amber-500" }, { name: "Northern", percent: 13, color: "bg-sky-500" }].map((region) => (
                <div key={region.name}><div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-700">{region.name}</span><span className="tabular-nums text-slate-500">{region.percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${region.color}`} style={{ width: `${region.percent}%` }} /></div></div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {(section === "monitor" || section === "stations") && (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100"><CardTitle className="text-base">{section === "monitor" ? "Station feed activity" : "Uganda FM panel"}</CardTitle><CardDescription>Real station names and monitored locations across Uganda.</CardDescription></CardHeader>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead className="bg-slate-50"><tr>{["Station", "City", "Region", "Today’s spins", "Feed"].map((header) => <th key={header} className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{stations.map((station) => <tr key={station.name}><td className="px-5 py-3.5 text-sm font-semibold text-slate-800">{station.name}</td><td className="px-5 py-3.5 text-sm text-slate-600">{station.city}</td><td className="px-5 py-3.5 text-sm text-slate-600">{station.region}</td><td className="px-5 py-3.5 text-sm font-semibold tabular-nums text-slate-800">{formatNumber(station.plays)}</td><td className="px-5 py-3.5"><Badge variant="success"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{station.status}</Badge></td></tr>)}</tbody></table></div>
        </Card>
      )}

      {section === "cmo" && (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100"><CardTitle className="text-base">Recent play log audit</CardTitle><CardDescription>Latest airplay matches submitted for rights review.</CardDescription></CardHeader>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="bg-slate-50"><tr>{["Recording", "Station", "Region", "Detected", "Review"].map((header) => <th key={header} className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{cmoRows.map((row) => <tr key={`${row.track}-${row.station}`}><td className="px-5 py-3.5"><p className="text-sm font-semibold text-slate-800">{row.track}</p><p className="text-xs text-slate-500">{row.artist}</p></td><td className="px-5 py-3.5 text-sm text-slate-700">{row.station}</td><td className="px-5 py-3.5 text-sm text-slate-600">{row.region}</td><td className="px-5 py-3.5 text-xs text-slate-600">Today, {row.timestamp}</td><td className="px-5 py-3.5"><Badge variant={row.status === "Matched" ? "success" : "warning"}>{row.status}</Badge></td></tr>)}</tbody></table></div>
        </Card>
      )}

      {(section === "reports" || section === "settings") && (
        <div className="grid gap-4 md:grid-cols-2">
          {(section === "reports"
            ? [{ title: "Monthly airplay statement", detail: "Spin totals by station and region · September 2026", icon: FileText }, { title: "Regional performance", detail: "Central, Eastern, Western and Northern breakdown", icon: BarChart3 }, { title: "Verified detections", detail: "Recent confirmed plays from the Uganda FM panel", icon: Headphones }, { title: "Audience reach summary", detail: "Estimated listeners by station and broadcast region", icon: UsersRound }]
            : [{ title: "Artist profile", detail: "Bebe Cool · Artist account · Verified", icon: UsersRound }, { title: "Delivery preferences", detail: "MP3 and WAV masters · ISRC generation enabled", icon: FileText }, { title: "Airplay notifications", detail: "Get an alert when a track is detected on radio", icon: Radio }, { title: "Security and access", detail: "Manage sign-in and authorized team members", icon: ShieldCheck }]
          ).map((item) => {
            const Icon = item.icon;
            return <Card key={item.title}><CardContent className="flex items-start gap-4 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-brand"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{item.detail}</p><Button variant="ghost" size="sm" className="mt-3 -ml-3 text-brand">{section === "reports" ? "Open report" : "Manage"}<ArrowUpRight className="h-3.5 w-3.5" /></Button></div></CardContent></Card>;
          })}
        </div>
      )}

      <p className="text-center text-[10px] text-slate-400">EastSound Monitor · Uganda music airplay intelligence</p>
    </div>
  );
}
