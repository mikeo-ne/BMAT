"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileAudio2,
  Headphones,
  MapPin,
  Music2,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatFileSize, formatNumber } from "@/lib/utils";

type Region = "Central" | "Eastern" | "Western" | "Northern";
type RegionSpins = Record<Region, number>;
type TrackStatus = "Verified" | "Monitoring";

interface Track {
  id: string;
  title: string;
  artist: string;
  featuredArtists: string[];
  isrc: string;
  releaseDate: string;
  spins: RegionSpins;
  lastSpin: string;
  status: TrackStatus;
}

const REGIONS: Region[] = ["Central", "Eastern", "Western", "Northern"];
const REGION_COLORS: Record<Region, string> = {
  Central: "#7354cf",
  Eastern: "#0f9b83",
  Western: "#e79632",
  Northern: "#3986d7",
};
const REGION_STATIONS: Record<Region, number> = {
  Central: 9,
  Eastern: 5,
  Western: 5,
  Northern: 5,
};
const STATIONS = [
  { name: "CBS FM", location: "Kampala, Central", spins: 1482 },
  { name: "Galaxy FM", location: "Kampala, Central", spins: 1260 },
  { name: "Radio Simba", location: "Kampala, Central", spins: 1086 },
  { name: "Crooze FM", location: "Mbarara, Western", spins: 724 },
];

const SEED_TRACKS: Track[] = [
  {
    id: "t-1",
    title: "Nkwagala",
    artist: "Bebe Cool",
    featuredArtists: ["Rema Namakula"],
    isrc: "UG-ESD-24-00001",
    releaseDate: "2024-02-14",
    spins: { Central: 1640, Eastern: 405, Western: 296, Northern: 184 },
    lastSpin: "8 min ago · CBS FM",
    status: "Verified",
  },
  {
    id: "t-2",
    title: "Tuli Kubigere",
    artist: "Eddy Kenzo",
    featuredArtists: [],
    isrc: "UG-ESD-23-00018",
    releaseDate: "2023-11-03",
    spins: { Central: 1388, Eastern: 364, Western: 281, Northern: 209 },
    lastSpin: "14 min ago · Galaxy FM",
    status: "Verified",
  },
  {
    id: "t-3",
    title: "Baliwa",
    artist: "Spice Diana",
    featuredArtists: ["Jose Chameleone"],
    isrc: "UG-ESD-24-00027",
    releaseDate: "2024-05-22",
    spins: { Central: 1142, Eastern: 318, Western: 252, Northern: 172 },
    lastSpin: "21 min ago · Radio Simba",
    status: "Verified",
  },
  {
    id: "t-4",
    title: "Onsanula",
    artist: "Winnie Nwagi",
    featuredArtists: [],
    isrc: "UG-ESD-23-00042",
    releaseDate: "2023-08-17",
    spins: { Central: 936, Eastern: 277, Western: 194, Northern: 142 },
    lastSpin: "32 min ago · Beat FM",
    status: "Verified",
  },
  {
    id: "t-5",
    title: "Malaika",
    artist: "Jose Chameleone",
    featuredArtists: [],
    isrc: "UG-ESD-22-00093",
    releaseDate: "2022-06-09",
    spins: { Central: 824, Eastern: 214, Western: 188, Northern: 127 },
    lastSpin: "46 min ago · Radio West",
    status: "Verified",
  },
  {
    id: "t-6",
    title: "Sitya Loss",
    artist: "Eddy Kenzo",
    featuredArtists: [],
    isrc: "UG-ESD-14-00056",
    releaseDate: "2014-02-01",
    spins: { Central: 680, Eastern: 230, Western: 171, Northern: 132 },
    lastSpin: "1 hr ago · UBC Radio",
    status: "Verified",
  },
  {
    id: "t-7",
    title: "Naliwo Omwoyo",
    artist: "Sheebah Karungi",
    featuredArtists: [],
    isrc: "UG-ESD-21-00063",
    releaseDate: "2021-09-10",
    spins: { Central: 598, Eastern: 173, Western: 148, Northern: 94 },
    lastSpin: "1 hr ago · Capital FM",
    status: "Verified",
  },
  {
    id: "t-8",
    title: "All Over You",
    artist: "Vinka",
    featuredArtists: ["Swangz Avenue"],
    isrc: "UG-ESD-24-00102",
    releaseDate: "2024-01-18",
    spins: { Central: 442, Eastern: 166, Western: 115, Northern: 91 },
    lastSpin: "2 hrs ago · Nile Radio",
    status: "Verified",
  },
];

function sumSpins(spins: RegionSpins) {
  return REGIONS.reduce((total, region) => total + spins[region], 0);
}

function ArtistAvatar({ name, index }: { name: string; index: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const colors = ["bg-violet-100 text-violet-700", "bg-cyan-100 text-cyan-700", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-700"];

  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${colors[index % colors.length]}`} aria-hidden="true">
      {initials}
    </span>
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tint,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tint: string;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:text-xs">{label}</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
          </div>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${tint}`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
          </span>
        </div>
        <p className="mt-2 truncate text-[11px] text-slate-500 sm:text-xs">{note}</p>
      </CardContent>
    </Card>
  );
}

export function ArtistPortal() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<Track[]>(SEED_TRACKS);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [featuredArtists, setFeaturedArtists] = useState("");
  const [releaseDate, setReleaseDate] = useState("2026-10-07");
  const [isrc, setIsrc] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<Region | "All regions">("All regions");
  const [catalogView, setCatalogView] = useState<"all" | "verified">("all");

  const regionalSummary = useMemo(
    () =>
      REGIONS.map((region) => ({
        region,
        spins: tracks.reduce((total, track) => total + track.spins[region], 0),
      })),
    [tracks],
  );
  const totalSpins = useMemo(() => tracks.reduce((total, track) => total + sumSpins(track.spins), 0), [tracks]);
  const maxRegionSpins = Math.max(...regionalSummary.map((item) => item.spins), 1);

  const filteredTracks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tracks.filter((track) => {
      const matchesSearch = !query || [track.title, track.artist, track.isrc, ...track.featuredArtists].some((value) => value.toLowerCase().includes(query));
      const matchesRegion = regionFilter === "All regions" || track.spins[regionFilter] > 0;
      const matchesView = catalogView === "all" || track.status === "Verified";
      return matchesSearch && matchesRegion && matchesView;
    });
  }, [catalogView, regionFilter, search, tracks]);

  const acceptAudioFile = (candidate?: File) => {
    if (!candidate) return;
    const hasAudioExtension = /\.(mp3|wav)$/i.test(candidate.name);
    const hasAudioMime = candidate.type === "audio/mpeg" || candidate.type === "audio/mp3" || candidate.type === "audio/wav" || candidate.type === "audio/x-wav" || candidate.type === "audio/wave";
    if (!hasAudioExtension && !hasAudioMime) {
      setNotice({ tone: "error", text: "Choose an MP3 or WAV audio master." });
      return;
    }
    if (candidate.size > 50 * 1024 * 1024) {
      setNotice({ tone: "error", text: "This file is over 50 MB. Upload a smaller MP3 or WAV master." });
      return;
    }
    setFile(candidate);
    setNotice(null);
    const suggestedTitle = candidate.name.replace(/\.(mp3|wav)$/i, "").replace(/[_-]+/g, " ").trim();
    setTitle((current) => current || suggestedTitle);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    acceptAudioFile(event.target.files?.[0]);
    // Allow re-selecting the same filename after removing it.
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptAudioFile(event.dataTransfer.files?.[0]);
  };

  const handleDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const generateIsrc = () => {
    const highestSequence = tracks.reduce((highest, track) => {
      const sequence = Number(track.isrc.match(/-(\d{5})$/)?.[1] ?? 0);
      return Math.max(highest, sequence);
    }, 0);
    const year = releaseDate ? releaseDate.slice(2, 4) : "26";
    setIsrc(`UG-ESD-${year}-${String(highestSequence + 1).padStart(5, "0")}`);
    setNotice({ tone: "success", text: "A unique ISRC has been generated for this release." });
  };

  const clearForm = () => {
    setFile(null);
    setTitle("");
    setArtist("");
    setFeaturedArtists("");
    setReleaseDate("2026-10-07");
    setIsrc("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setNotice({ tone: "error", text: "Add an MP3 or WAV master before submitting the release." });
      return;
    }
    if (!title.trim() || !artist.trim() || !releaseDate || !isrc.trim()) {
      setNotice({ tone: "error", text: "Complete the required metadata and generate an ISRC before submitting." });
      return;
    }

    const newTrack: Track = {
      id: `local-${Date.now()}`,
      title: title.trim(),
      artist: artist.trim(),
      featuredArtists: featuredArtists.split(/[;,]/).map((name) => name.trim()).filter(Boolean),
      isrc: isrc.trim().toUpperCase(),
      releaseDate,
      spins: { Central: 0, Eastern: 0, Western: 0, Northern: 0 },
      lastSpin: "Awaiting first spin",
      status: "Monitoring",
    };
    setTracks((current) => [newTrack, ...current]);
    setCatalogView("all");
    setSearch("");
    setRegionFilter("All regions");
    clearForm();
    setNotice({ tone: "success", text: `“${newTrack.title}” is in the catalogue and queued for audio matching.` });
  };

  const statCards = [
    {
      label: "Verified radio spins",
      value: formatNumber(totalSpins),
      note: "+8.4% compared with last month",
      icon: Headphones,
      tint: "bg-violet-50 text-violet-700",
    },
    {
      label: "Active catalogue",
      value: formatNumber(tracks.length),
      note: `${tracks.filter((track) => track.status === "Verified").length} tracks fingerprinted`,
      icon: Music2,
      tint: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Stations reporting",
      value: "24 / 24",
      note: "Uganda FM panel online",
      icon: Radio,
      tint: "bg-sky-50 text-sky-700",
    },
    {
      label: "Regional coverage",
      value: "4 regions",
      note: "Central · Eastern · Western · Northern",
      icon: MapPin,
      tint: "bg-amber-50 text-amber-700",
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Page introduction */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#25134f] via-[#42217c] to-[#6b35a3] px-4 py-5 text-white shadow-card sm:px-6 sm:py-7 lg:px-8 lg:py-8">
        <div className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-1/3 h-56 w-56 rounded-full bg-violet-300/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="border-white/15 bg-white/10 text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Artist workspace
              </Badge>
              <span className="text-[11px] font-medium text-violet-100/80">UGANDA · EAST AFRICA</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-[34px]">Artist &amp; Label Portal</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-violet-100/80 sm:text-[15px]">
              Deliver your masters once. Follow verified spins across Uganda FM and see where listeners are tuning in.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <ArrowDownToLine className="h-4 w-4" />
              Export report
            </Button>
            <Button
              variant="secondary"
              className="bg-white text-violet-800 hover:bg-violet-50"
              onClick={() => document.getElementById("deliver-master")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <Plus className="h-4 w-4" />
              Add a release
            </Button>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-[11px] text-violet-100/80">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> ISRC-backed matching</span>
          <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-emerald-300" /> Updated in near real time</span>
          <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-emerald-300" /> 24 Ugandan radio stations</span>
        </div>
      </section>

      {/* Summary stats */}
      <section aria-label="Catalogue summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {statCards.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      {/* Uploader and metadata */}
      <Card id="deliver-master" className="scroll-mt-24 overflow-hidden">
        <CardHeader className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-brand"><UploadCloud className="h-4 w-4" /></span>
                Deliver a new master
              </CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">MP3 or WAV · max 50 MB · Required metadata is marked with an asterisk.</CardDescription>
            </div>
            <Badge variant="muted" className="hidden sm:inline-flex">Secure delivery</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[minmax(260px,0.82fr)_minmax(0,1.18fr)] xl:gap-7">
            <div className="min-w-0">
              <label htmlFor="audio-upload" className="field-label">Audio master <span className="text-rose-500">*</span></label>
              <input
                id="audio-upload"
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
                className="sr-only"
                onChange={handleFileInput}
              />
              {file ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand shadow-sm"><FileAudio2 className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm font-semibold text-slate-900">{file.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)} <span className="mx-1">·</span> {file.name.toLowerCase().endsWith(".wav") ? "WAV audio" : "MP3 audio"}</p>
                    </div>
                    <button type="button" onClick={() => setFile(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-rose-600" aria-label="Remove selected audio file"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2.5 text-xs text-emerald-700">
                    <Check className="h-4 w-4 shrink-0" />
                    Ready for delivery. We will fingerprint this master for airplay matching.
                  </div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 text-xs font-semibold text-brand hover:text-brand-dark">Choose a different file</button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={handleDropzoneKeyDown}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
                  onDrop={handleDrop}
                  className={`flex min-h-[225px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors sm:min-h-[260px] ${isDragging ? "border-brand bg-violet-50" : "border-slate-200 bg-slate-50/70 hover:border-violet-300 hover:bg-violet-50/50"}`}
                  aria-label="Choose an MP3 or WAV file, or drop it here"
                >
                  <span className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${isDragging ? "bg-brand text-white" : "bg-white text-brand shadow-sm"}`}>
                    <UploadCloud className="h-7 w-7" strokeWidth={1.7} />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-900">Drop your audio master here</p>
                  <p className="mt-1 text-xs text-slate-500">or <span className="font-semibold text-brand underline underline-offset-2">browse files</span></p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-slate-600">MP3</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-slate-600">WAV</span>
                    <span className="px-1 py-1 text-[10px] text-slate-400">Up to 50 MB</span>
                  </div>
                </div>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />Audio is only used to identify and verify radio broadcasts. You retain ownership of your master.</p>
            </div>

            <div className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Release metadata</p>
                  <p className="mt-0.5 text-xs text-slate-500">Help stations and rights teams identify your recording.</p>
                </div>
                <span className="text-[10px] text-slate-400">* Required</span>
              </div>
              <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="song-title" className="field-label">Song title <span className="text-rose-500">*</span></label>
                  <Input id="song-title" placeholder="e.g. Nkwagala" value={title} onChange={(event) => setTitle(event.target.value)} required />
                </div>
                <div>
                  <label htmlFor="primary-artist" className="field-label">Primary artist <span className="text-rose-500">*</span></label>
                  <Input id="primary-artist" placeholder="e.g. Bebe Cool" value={artist} onChange={(event) => setArtist(event.target.value)} required />
                </div>
                <div>
                  <label htmlFor="featured-artists" className="field-label">Featured artists</label>
                  <Input id="featured-artists" placeholder="Separate names with commas" value={featuredArtists} onChange={(event) => setFeaturedArtists(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="release-date" className="field-label">Release date <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="release-date" type="date" className="pl-9" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} required />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="isrc" className="field-label">ISRC <span className="text-rose-500">*</span></label>
                  <div className="flex flex-col gap-2 xs:flex-row">
                    <Input id="isrc" className="min-w-0 font-mono uppercase tracking-wide" placeholder="UG-ESD-26-00001" value={isrc} onChange={(event) => setIsrc(event.target.value.toUpperCase())} required />
                    <Button type="button" variant="outline" className="shrink-0 xs:w-[164px]" onClick={generateIsrc}>
                      <Sparkles className="h-4 w-4 text-brand" />
                      Generate ISRC
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">Uganda code + EastSound registrant + year + unique sequence.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 xs:flex-row xs:items-center xs:justify-between">
                <Button type="button" variant="ghost" className="text-slate-500" onClick={clearForm}>Clear fields</Button>
                <Button type="submit" className="w-full xs:w-auto">
                  <UploadCloud className="h-4 w-4" />
                  Add to catalogue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </form>
          {notice && (
            <div className={`mt-4 flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-xs ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`} role="status">
              <span className="flex items-start gap-2"><span className="mt-0.5">{notice.tone === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}</span>{notice.text}</span>
              <button type="button" className="rounded p-0.5 opacity-60 hover:opacity-100" onClick={() => setNotice(null)} aria-label="Dismiss message"><X className="h-4 w-4" /></button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Regional airplay and station coverage */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]" aria-label="Regional airplay analytics">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-start justify-between gap-3 px-4 pb-2 sm:px-6">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-brand"><BarChart3 className="h-4 w-4" /></span>
                Airplay by region
              </CardTitle>
              <CardDescription className="mt-1 text-xs">Verified spins across Uganda · rolling 30 days</CardDescription>
            </div>
            <Badge variant="muted" className="shrink-0">All tracks</Badge>
          </CardHeader>
          <CardContent className="px-4 pb-5 sm:px-6 sm:pb-6">
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" />Spins by region</span>
              <span className="flex items-center gap-1.5"><Radio className="h-3 w-3" />24 station panel</span>
              <span className="flex items-center gap-1.5"><Clock3 className="h-3 w-3" />Updated moments ago</span>
            </div>
            <div className="space-y-4">
              {regionalSummary.map(({ region, spins }) => {
                const share = totalSpins ? (spins / totalSpins) * 100 : 0;
                return (
                  <div key={region}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: REGION_COLORS[region] }} />
                        <span className="text-xs font-semibold text-slate-700">{region}</span>
                        <span className="hidden text-[10px] text-slate-400 xs:inline">{REGION_STATIONS[region]} stations</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs font-bold tabular-nums text-slate-900">{formatNumber(spins)}</span>
                        <span className="ml-2 text-[10px] tabular-nums text-slate-500">{share.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.max(spins > 0 ? 2 : 0, (spins / maxRegionSpins) * 100)}%`, backgroundColor: REGION_COLORS[region] }}
                        role="img"
                        aria-label={`${region}: ${formatNumber(spins)} spins, ${share.toFixed(1)} percent of total`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-4">
              {regionalSummary.map(({ region, spins }) => (
                <div key={region} className="rounded-xl bg-slate-50 px-2.5 py-2.5 sm:px-3">
                  <p className="truncate text-[10px] font-medium text-slate-500">{region}</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatNumber(spins)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="px-4 pb-2 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Radio className="h-4 w-4" /></span>
              Top reporting stations
            </CardTitle>
            <CardDescription className="mt-1 text-xs">Stations driving your verified spins</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 px-3 pb-4 sm:px-4 sm:pb-5">
            {STATIONS.map((station, index) => (
              <div key={station.name} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${index === 0 ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{station.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{station.name}</p>
                  <p className="truncate text-[10px] text-slate-500">{station.location}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold tabular-nums text-slate-900">{formatNumber(station.spins)}</p>
                  <p className="text-[10px] text-slate-400">spins</p>
                </div>
              </div>
            ))}
            <button type="button" className="flex min-h-10 w-full items-center justify-center gap-1 rounded-lg text-xs font-semibold text-brand transition-colors hover:bg-violet-50">
              View station activity <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>
      </section>

      {/* Active catalog */}
      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-brand"><Music2 className="h-5 w-5" /></span>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Active catalogue</CardTitle>
              <CardDescription className="mt-1 text-xs">Track delivery, verified spins and regional performance.</CardDescription>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-[210px] lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="min-h-10 pl-9 text-xs" placeholder="Search tracks or ISRC" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search catalogue" />
            </div>
            <div className="relative min-w-0 sm:w-[160px]">
              <select
                className="min-h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-9 text-xs font-medium text-slate-700 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value as Region | "All regions")}
                aria-label="Filter catalogue by region"
              >
                <option>All regions</option>
                {REGIONS.map((region) => <option key={region}>{region}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Catalogue filters">
            <button type="button" role="tab" aria-selected={catalogView === "all"} onClick={() => setCatalogView("all")} className={`min-h-8 rounded-md px-3 text-xs font-semibold transition ${catalogView === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>All tracks <span className="ml-1 text-[10px] text-slate-400">{tracks.length}</span></button>
            <button type="button" role="tab" aria-selected={catalogView === "verified"} onClick={() => setCatalogView("verified")} className={`min-h-8 rounded-md px-3 text-xs font-semibold transition ${catalogView === "verified" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Verified <span className="ml-1 text-[10px] text-slate-400">{tracks.filter((track) => track.status === "Verified").length}</span></button>
          </div>
          <span className="text-[11px] text-slate-500">Showing {filteredTracks.length} of {tracks.length} releases</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/80">
                <th scope="col" className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:px-6">Track / artist</th>
                <th scope="col" className="px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">ISRC</th>
                <th scope="col" className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Total spins</th>
                <th scope="col" className="px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Leading region</th>
                <th scope="col" className="px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Latest play</th>
                <th scope="col" className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTracks.map((track, index) => {
                const leader = REGIONS.reduce((best, region) => track.spins[region] > track.spins[best] ? region : best, REGIONS[0]);
                const spins = sumSpins(track.spins);
                return (
                  <tr key={track.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3.5 sm:px-6">
                      <div className="flex items-center gap-3">
                        <ArtistAvatar name={track.title} index={index} />
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate text-xs font-semibold text-slate-900">{track.title}</p>
                          <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-500">{track.artist}{track.featuredArtists.length ? ` ft. ${track.featuredArtists.join(", ")}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[11px] text-slate-500">{track.isrc}</td>
                    <td className="px-3 py-3.5 text-right">
                      <span className="text-xs font-bold tabular-nums text-slate-900">{formatNumber(spins)}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">across Uganda FM</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700"><span className="h-2 w-2 rounded-full" style={{ background: REGION_COLORS[leader] }} />{leader}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">{formatNumber(track.spins[leader])} spins</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-600"><Clock3 className="h-3.5 w-3.5 text-slate-400" />{track.lastSpin}</span>
                    </td>
                    <td className="px-4 py-3.5 sm:px-6">
                      <Badge variant={track.status === "Verified" ? "success" : "warning"}>
                        {track.status === "Verified" ? <Check className="h-3 w-3" /> : <AudioLines className="h-3 w-3" />}
                        {track.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {filteredTracks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="mx-auto flex max-w-xs flex-col items-center">
                      <Search className="h-6 w-6 text-slate-300" />
                      <p className="mt-2 text-sm font-semibold text-slate-700">No tracks found</p>
                      <p className="mt-1 text-xs text-slate-500">Try another title, artist, ISRC or region.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Spins are detected and cross-checked against station broadcast logs.</span>
          <span className="flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" />{REGIONS.reduce((sum, region) => sum + REGION_STATIONS[region], 0)} station feeds · 4 regions</span>
        </div>
      </Card>

      <footer className="flex flex-col gap-1 pb-2 text-center text-[10px] text-slate-400 sm:flex-row sm:justify-between sm:text-left">
        <span>EastSound Monitor · Uganda music airplay intelligence</span>
        <span>Demo catalogue data · Updated 7 Oct 2026</span>
      </footer>
    </div>
  );
}
