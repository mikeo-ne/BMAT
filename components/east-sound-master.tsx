"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  Calculator,
  AlertTriangle,
  UserCheck,
  FileText,
  Lock,
  Radio,
  TrendingUp,
  Users,
  Music,
  BarChart3,
  PieChart,
  Download,
  Search,
  Bell,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Trash2,
  Eye,
  Clock
} from 'lucide-react';



type UserRole = 'ARTIST_LABEL' | 'CMO_ADMIN' | 'BROADCASTER';

type StationTier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'National' | 'Regional' | 'Community';

type StationStatus = 'ACTIVE' | 'UNLICENSED' | 'PENDING' | 'SUSPENDED';

interface StationBilling {
  id: string;
  name: string;
  region: string;
  location: string;
  frequency: string;
  tier: StationTier;
  baseFee: number;
  perSpinRate: number;
  trackedSpins: number;
  status: StationStatus;
  reach: number;
  lastReport: string;
  complianceScore: number;
}

interface Track {
  id: string;
  isrc: string;
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  duration: number;
  genre: string;
  releaseDate: string;
  plays: number;
  stations: string[];
}

interface RoyaltyStatement {
  month: string;
  totalPlays: number;
  totalRoyalties: number;
  stations: Record<string, { plays: number; royalties: number }>;
  tracks: Record<string, { plays: number; royalties: number }>;
}

interface Infringement {
  id: string;
  stationId: string;
  stationName: string;
  region: string;
  unlicensedSpins: number;
  detectedAt: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'RESOLVED' | 'ESCALATED';
  evidence: string[];
}

interface Alert {
  id: string;
  type: 'INFRINGEMENT' | 'COMPLIANCE' | 'PAYMENT' | 'SYSTEM';
  title: string;
  message: string;
  timestamp: string;
  severity: 'CRITICAL' | 'HIGH' | 'WARNING' | 'MEDIUM' | 'LOW' | 'INFO';
  resolved: boolean;
}

// API Response interfaces
interface StationsApiResponse {
  stations: {
    id: string;
    name: string;
    region: string;
    location: string;
    frequency: string;
    reach: number;
    monitored?: boolean;
    medium?: string;
  }[];
  regions: string[];
  monitoredCount: number;
  panelSize: number;
}

interface TracksApiResponse {
  tracks?: {
    id?: string;
    isrc: string;
    title: string;
    primaryArtist: string;
    featuredArtists?: string[];
    duration?: number;
    genre?: string;
    releaseDate: string;
    stations?: string[];
  }[];
}

const formatUGX = (amount: number) => `UGX ${amount.toLocaleString('en-UG')}`;


const TIER_CONFIG: Record<StationTier, { label: string; baseFee: number; perSpinRate: number; color: string }> = {
  'Tier 1': { label: 'Tier 1 (National)', baseFee: 5000000, perSpinRate: 2500, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  'Tier 2': { label: 'Tier 2 (Regional)', baseFee: 2500000, perSpinRate: 1200, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'Tier 3': { label: 'Tier 3 (Community)', baseFee: 1000000, perSpinRate: 500, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  National: { label: 'National FM', baseFee: 8000000, perSpinRate: 450, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  Regional: { label: 'Regional FM', baseFee: 3000000, perSpinRate: 300, color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  Community: { label: 'Community FM', baseFee: 1000000, perSpinRate: 180, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
};

const STATUS_CONFIG: Record<StationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ACTIVE: { label: 'Licensed & Compliant', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: <CheckCircle className="w-3 h-3" /> },
  UNLICENSED: { label: 'Unlicensed', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: <XCircle className="w-3 h-3" /> },
  PENDING: { label: 'Pending Approval', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: <Clock className="w-3 h-3" /> },
  SUSPENDED: { label: 'Suspended', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: <AlertTriangle className="w-3 h-3" /> },
};

const SEVERITY_CONFIG: Record<'CRITICAL' | 'HIGH' | 'WARNING' | 'MEDIUM' | 'LOW' | 'INFO', { color: string; label: string }> = {
  CRITICAL: { color: 'text-rose-400 bg-rose-500/20 border-rose-500/30', label: 'Critical' },
  HIGH: { color: 'text-rose-400 bg-rose-500/20 border-rose-500/30', label: 'High' },
  WARNING: { color: 'text-amber-400 bg-amber-500/20 border-amber-500/30', label: 'Warning' },
  MEDIUM: { color: 'text-amber-400 bg-amber-500/20 border-amber-500/30', label: 'Medium' },
  LOW: { color: 'text-slate-400 bg-slate-500/20 border-slate-500/30', label: 'Low' },
  INFO: { color: 'text-sky-400 bg-sky-500/20 border-sky-500/30', label: 'Info' },
};

export default function EastSoundMasterModule() {

  const [currentRole, setCurrentRole] = useState<UserRole>('CMO_ADMIN');
  const [activeTab, setActiveTab] = useState<'calculator' | 'infringements' | 'catalog' | 'analytics' | 'alerts'>('calculator');
  const [selectedStation, setSelectedStation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  
  // Data states
  const [stations, setStations] = useState<StationBilling[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [infringements, setInfringements] = useState<Infringement[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [royaltyStatements, setRoyaltyStatements] = useState<RoyaltyStatement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from APIs
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch stations
        const stationsRes = await fetch('/api/stations');
        if (!stationsRes.ok) throw new Error('Failed to fetch stations');
        const stationsData = await stationsRes.json();
        
        // Transform stations data to our format
        const transformedStations: StationBilling[] = stationsData.stations.map((station: Record<string, any>) => ({
          id: station.id,
          name: station.name,
          region: station.region,
          location: station.location,
          frequency: station.frequency,
          tier: station.reach >= 1000000 ? 'National' : station.reach >= 400000 ? 'Regional' : 'Community',
          baseFee: station.reach >= 1000000 ? 8000000 : station.reach >= 400000 ? 3000000 : 1000000,
          perSpinRate: station.reach >= 1000000 ? 450 : station.reach >= 400000 ? 300 : 180,
          trackedSpins: Math.floor(Math.random() * 2000) + 100,
          status: Math.random() > 0.85 ? 'UNLICENSED' : Math.random() > 0.7 ? 'PENDING' : Math.random() > 0.95 ? 'SUSPENDED' : 'ACTIVE',
          reach: station.reach,
          lastReport: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          complianceScore: Math.floor(Math.random() * 100) + 1,
        }));
        
        setStations(transformedStations);

        // Fetch tracks/catalogue
        const tracksRes = await fetch('/api/tracks');
        if (!tracksRes.ok) throw new Error('Failed to fetch tracks');
        const tracksData = await tracksRes.json();
        
        // Transform tracks data
        const transformedTracks: Track[] = tracksData.tracks?.map((track: Record<string, any>) => ({
          id: track.id || track.isrc,
          isrc: track.isrc,
          title: track.title,
          primaryArtist: track.primaryArtist,
          featuredArtists: track.featuredArtists || [],
          duration: track.duration || 180,
          genre: track.genre || 'Unknown',
          releaseDate: track.releaseDate,
          plays: Math.floor(Math.random() * 5000) + 100,
          stations: track.stations || [],
        })) || [];
        
        setTracks(transformedTracks);

        // Generate mock infringements based on stations
        const newInfringements: Infringement[] = transformedStations
          .filter(s => s.status === 'UNLICENSED')
          .map(station => ({
            id: `inf_${station.id}_${Date.now()}`,
            stationId: station.id,
            stationName: station.name,
            region: station.region,
            unlicensedSpins: Math.floor(Math.random() * 1000) + 50,
            detectedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            severity: Math.random() > 0.5 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN',
            evidence: [`Spin log analysis`, `Broadcast fingerprint match`, `Content ID verification`],
          }));
        
        setInfringements(newInfringements);

        // Generate mock alerts
        const newAlerts: Alert[] = [
          {
            id: 'alert_1',
            type: 'INFRINGEMENT',
            title: 'New Unlicensed Broadcast Detected',
            message: `Galaxy FM (Kampala) detected with ${Math.floor(Math.random() * 500) + 100} unlicensed spins`,
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            severity: 'HIGH',
            resolved: false,
          },
          {
            id: 'alert_2',
            type: 'COMPLIANCE',
            title: 'Station Compliance Report Due',
            message: 'Monthly compliance reports from 5 stations are overdue',
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            severity: 'WARNING',
            resolved: false,
          },
          {
            id: 'alert_3',
            type: 'PAYMENT',
            title: 'Royalty Distribution Processed',
            message: `UGX ${Math.floor(Math.random() * 50000000) + 10000000} distributed to 45 members`,
            timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
            severity: 'INFO',
            resolved: true,
          },
        ];
        
        setAlerts(newAlerts);

        // Generate mock royalty statements
        const statements: RoyaltyStatement[] = [];
        for (let i = 0; i < 6; i++) {
          const month = new Date();
          month.setMonth(month.getMonth() - i);
          const monthStr = month.toISOString().slice(0, 7);
          
          statements.push({
            month: monthStr,
            totalPlays: Math.floor(Math.random() * 50000) + 10000,
            totalRoyalties: Math.floor(Math.random() * 50000000) + 10000000,
            stations: transformedStations.slice(0, 5).reduce((acc, station) => {
              acc[station.id] = {
                plays: Math.floor(Math.random() * 5000) + 100,
                royalties: Math.floor(Math.random() * 2000000) + 500000,
              };
              return acc;
            }, {} as Record<string, { plays: number; royalties: number }>),
            tracks: transformedTracks.slice(0, 10).reduce((acc, track) => {
              acc[track.id] = {
                plays: Math.floor(Math.random() * 1000) + 50,
                royalties: Math.floor(Math.random() * 500000) + 100000,
              };
              return acc;
            }, {} as Record<string, { plays: number; royalties: number }>),
          });
        }
        
        setRoyaltyStatements(statements);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        console.error('Error fetching data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter stations based on search and filters
  const filteredStations = useMemo(() => {
    return stations.filter(station => {
      const matchesSearch = station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          station.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          station.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStation = selectedStation === 'all' || station.id === selectedStation;
      return matchesSearch && matchesStation;
    });
  }, [stations, searchQuery, selectedStation]);

  // Calculate statistics
  const stats = useMemo(() => {
    const activeStations = stations.filter(s => s.status === 'ACTIVE').length;
    const unlicensedStations = stations.filter(s => s.status === 'UNLICENSED').length;
    const totalSpins = stations.reduce((sum, s) => sum + s.trackedSpins, 0);
    const totalRevenue = stations.reduce((sum, s) => sum + s.baseFee + (s.trackedSpins * s.perSpinRate), 0);
    const totalTracks = tracks.length;
    const totalArtists = new Set([...tracks.map(t => t.primaryArtist), ...tracks.flatMap(t => t.featuredArtists)]).size;
    const totalRoyalties = royaltyStatements.reduce((sum, s) => sum + s.totalRoyalties, 0);
    
    return {
      activeStations,
      unlicensedStations,
      totalSpins,
      totalRevenue,
      totalTracks,
      totalArtists,
      totalRoyalties,
      averageCompliance: stations.reduce((sum, s) => sum + s.complianceScore, 0) / stations.length || 0,
    };
  }, [stations, tracks, royaltyStatements]);

  // Handle role switch
  const handleRoleSwitch = useCallback((role: UserRole) => {
    setCurrentRole(role);
    // Set appropriate default tab for each role
    if (role === 'ARTIST_LABEL') setActiveTab('catalog');
    if (role === 'CMO_ADMIN') setActiveTab('calculator');
    if (role === 'BROADCASTER') setActiveTab('calculator');
  }, []);

  // Export data functions
  const exportStationsCSV = useCallback(() => {
    if (filteredStations.length === 0) return;
    
    const headers = ['Station ID', 'Name', 'Region', 'Location', 'Frequency', 'Tier', 'Status', 'Base Fee', 'Per Spin Rate', 'Tracked Spins', 'Reach', 'Compliance Score'];
    const csvContent = [
      headers.join(','),
      ...filteredStations.map(s => [
        s.id,
        `"${s.name}"`,
        s.region,
        s.location,
        s.frequency,
        s.tier,
        s.status,
        s.baseFee,
        s.perSpinRate,
        s.trackedSpins,
        s.reach,
        s.complianceScore,
      ].join(',')),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `east-sound-stations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredStations]);

  const exportInfringementsCSV = useCallback(() => {
    if (infringements.length === 0) return;
    
    const headers = ['Infringement ID', 'Station ID', 'Station Name', 'Region', 'Unlicensed Spins', 'Detected At', 'Severity', 'Status'];
    const csvContent = [
      headers.join(','),
      ...infringements.map(i => [
        i.id,
        i.stationId,
        `"${i.stationName}"`,
        i.region,
        i.unlicensedSpins,
        i.detectedAt,
        i.severity,
        i.status,
      ].join(',')),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `infringements-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [infringements]);

  const resolveInfringement = useCallback((infringementId: string) => {
    setInfringements(prev => prev.map(inf => 
      inf.id === infringementId ? { ...inf, status: 'RESOLVED' } : inf
    ));
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, resolved: true } : alert
    ));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400">Loading EastSound Compliance & Royalty Studio...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
        <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-rose-400 mb-2">Error Loading Data</h2>
          <p className="text-slate-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* Top Bar: Role Access Switcher */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-6 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-sky-400 flex items-center gap-2">
            <Radio className="w-6 h-6 text-sky-400" /> EastSound Compliance & Royalty Studio
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Automated Broadcast Monitoring & UPRS Regulatory Infrastructure for Uganda
          </p>
        </div>

        {/* Role Authenticator Simulator */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-lg">
          <span className="text-xs text-slate-400 px-2 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Portal Role:
          </span>
          {(['ARTIST_LABEL', 'BROADCASTER', 'CMO_ADMIN'] as UserRole[]).map((role) => (
            <button
              key={role}
              onClick={() => handleRoleSwitch(role)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                currentRole === role
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {role.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Bar */}
      {alerts.filter(a => !a.resolved).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <Bell className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-4">
                {alerts.filter(a => !a.resolved).slice(0, 3).map(alert => (
                  <div key={alert.id} className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${SEVERITY_CONFIG[alert.severity].color}`}>
                          {SEVERITY_CONFIG[alert.severity].label}
                        </span>
                        <p className="text-sm font-medium text-slate-200 mt-1">{alert.title}</p>
                        <p className="text-xs text-slate-400 truncate">{alert.message}</p>
                      </div>
                      <button
                        onClick={() => dismissAlert(alert.id)}
                        className="text-slate-500 hover:text-slate-300 ml-2 flex-shrink-0"
                        title="Dismiss"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role-Based Dashboard View */}
      {currentRole === 'CMO_ADMIN' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-sky-400 font-mono">{stats.activeStations}</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <CheckCircle className="w-3 h-3" /> Active Stations
              </div>
            </div>
            <div className="bg-slate-900 border border-rose-500/30 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-rose-400 font-mono">{stats.unlicensedStations}</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <XCircle className="w-3 h-3" /> Unlicensed
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-emerald-400 font-mono">{stats.totalSpins.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <Music className="w-3 h-3" /> Total Spins
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-amber-400 font-mono">{formatUGX(stats.totalRevenue)}</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" /> Total Revenue
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-purple-400 font-mono">{stats.totalTracks.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <Music className="w-3 h-3" /> Tracks
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-cyan-400 font-mono">{stats.totalArtists.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <Users className="w-3 h-3" /> Artists
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-green-400 font-mono">{Math.round(stats.averageCompliance)}%</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <Shield className="w-3 h-3" /> Avg Compliance
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setActiveTab('calculator')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === 'calculator'
                  ? 'bg-sky-500/10 border-sky-500 text-sky-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'
              }`}
            >
              <Calculator className="w-4 h-4" /> Tiered Licensing Calculator
            </button>
            <button
              onClick={() => setActiveTab('infringements')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === 'infringements'
                  ? 'bg-rose-500/10 border-rose-500 text-rose-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> Infringement Radar
              {infringements.filter(i => i.status === 'OPEN').length > 0 && (
                <span className="bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {infringements.filter(i => i.status === 'OPEN').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-purple-500/10 border-purple-500 text-purple-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-4 h-4" /> Analytics Dashboard
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === 'catalog'
                  ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-4 h-4" /> Catalog Management
            </button>
          </div>

          {/* TAB 1: ROYALTY & LICENSING CALCULATOR */}
          {activeTab === 'calculator' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
              <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Station Billing & Dynamic Royalty Matrix</h2>
                  <p className="text-xs text-slate-400">
                    Calculates statutory blanket base fees plus tracked per-spin allocations under UPRS tariff schedule.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search stations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-800/50 border border-slate-700 rounded-lg pl-8 pr-4 py-2 text-sm focus:outline-none focus:border-sky-500 w-48 md:w-64"
                    />
                  </div>
                  <select
                    value={selectedStation}
                    onChange={(e) => setSelectedStation(e.target.value)}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                  >
                    <option value="all">All Stations</option>
                    {stations.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={exportStationsCSV}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-sky-500/20 rounded-lg flex items-center justify-center">
                      <Radio className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Total Stations</div>
                      <div className="text-xl font-bold text-sky-400 font-mono">{filteredStations.length}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Total Tracked Spins</div>
                      <div className="text-xl font-bold text-emerald-400 font-mono">
                        {filteredStations.reduce((sum, s) => sum + s.trackedSpins, 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                      <Calculator className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Total Billing</div>
                      <div className="text-xl font-bold text-amber-400 font-mono">
                        {formatUGX(filteredStations.reduce((sum, s) => sum + s.baseFee + (s.trackedSpins * s.perSpinRate), 0))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Station Name</th>
                      <th className="p-3">Region</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Classification</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Base Blanket Fee</th>
                      <th className="p-3">Per-Spin Tariff</th>
                      <th className="p-3">Tracked Spins</th>
                      <th className="p-3">Compliance</th>
                      <th className="p-3 text-right">Total Payable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredStations.map((st) => {
                      const totalPayable = st.baseFee + st.trackedSpins * st.perSpinRate;
                      const tierConfig = TIER_CONFIG[st.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG['Community'];
                      const statusConfig = STATUS_CONFIG[st.status];
                      
                      return (
                        <tr key={st.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-semibold text-slate-100">{st.name}</td>
                          <td className="p-3 text-slate-400">{st.region}</td>
                          <td className="p-3 text-slate-400">{st.location}</td>
                          <td className="p-3">
                            <span className="bg-slate-800 border border-slate-700 text-sky-400 text-xs px-2.5 py-1 rounded-full font-mono">
                              {st.tier}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              {statusConfig.icon}
                              {st.status}
                            </span>
                          </td>
                          <td className="p-3 font-mono">{formatUGX(st.baseFee)}</td>
                          <td className="p-3 font-mono text-slate-400">{formatUGX(st.perSpinRate)}</td>
                          <td className="p-3 font-bold text-sky-400 font-mono">{st.trackedSpins.toLocaleString()}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-full bg-slate-800 rounded-full h-2">
                                <div 
                                  className={`bg-emerald-400 h-2 rounded-full transition-all`}
                                  style={{ width: `${st.complianceScore}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-400">{st.complianceScore}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-400 font-mono text-base">
                            {formatUGX(totalPayable)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {filteredStations.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No stations match your search criteria</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INFRINGEMENT RADAR */}
          {activeTab === 'infringements' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
              <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                <div>
                  <h2 className="text-lg font-bold text-rose-400 flex items-center gap-2">
                    <Shield className="w-5 h-5" /> Live Copyright Infringement Radar
                  </h2>
                  <p className="text-xs text-slate-400">
                    Detects unlicensed commercial broadcasting in real time under Uganda Copyright Act (2006) mandates.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportInfringementsCSV}
                    className="flex items-center gap-2 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Download className="w-4 h-4" /> Export Infringements CSV
                  </button>
                </div>
              </div>

              {/* Infringement Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-rose-950/30 border border-rose-500/30 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <div>
                      <div className="text-xs text-rose-400/60">Open Infringements</div>
                      <div className="text-xl font-bold text-rose-400 font-mono">
                        {infringements.filter(i => i.status === 'OPEN').length}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-amber-950/30 border border-amber-500/30 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-xs text-amber-400/60">Total Unlicensed Spins</div>
                      <div className="text-xl font-bold text-amber-400 font-mono">
                        {infringements.reduce((sum, i) => sum + i.unlicensedSpins, 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <div>
                      <div className="text-xs text-emerald-400/60">Resolved Cases</div>
                      <div className="text-xl font-bold text-emerald-400 font-mono">
                        {infringements.filter(i => i.status === 'RESOLVED').length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {infringements.map((st) => (
                  <div 
                    key={st.id} 
                    className={`bg-slate-950 border-l-4 p-4 rounded-r-lg flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                      st.status === 'OPEN' 
                        ? 'border-rose-500 border-y border-r border-slate-800' 
                        : 'border-emerald-500 border-y border-r border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold px-2 py-0.5 rounded`}>
                          {st.severity} SEVERITY
                        </span>
                        <span className="bg-slate-800 text-slate-400 border border-slate-700 text-xs px-2 py-0.5 rounded">
                          {st.region}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {new Date(st.detectedAt).toLocaleString('en-UG', { 
                            day: 'numeric', 
                            month: 'short', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-100 mt-2">{st.stationName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Station ID: <code className="bg-slate-800 px-1 rounded">{st.stationId}</code>
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        <strong className="text-rose-400">{st.unlicensedSpins.toLocaleString()}</strong> unlicensed spins detected without valid UPRS commercial broadcast clearance.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Evidence: {st.evidence.join(', ')}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          st.status === 'OPEN' 
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {st.status}
                        </span>
                      </div>
                      
                      {st.status === 'OPEN' && (
                        <>
                          <button
                            onClick={() => resolveInfringement(st.id)}
                            className="flex items-center gap-2 bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap justify-center"
                          >
                            <CheckCircle className="w-4 h-4" /> Mark as Resolved
                          </button>
                          <button
                            onClick={() => alert(`Statutory Cease & Desist Notice generated for ${st.stationName}. Reference: UPRS-C&D-${st.id}`)}
                            className="flex items-center gap-2 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap justify-center"
                          >
                            <FileText className="w-4 h-4" /> Generate Cease & Desist
                          </button>
                        </>
                      )}
                      
                      {st.status === 'RESOLVED' && (
                        <button
                          onClick={() => alert(`Case ${st.id} details: Resolved on ${new Date().toLocaleDateString()}`)}
                          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap justify-center"
                        >
                          <Eye className="w-4 h-4" /> View Resolution
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {infringements.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No infringements detected</p>
                    <p className="text-xs text-slate-600 mt-1">All monitored stations are compliant</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ANALYTICS DASHBOARD */}
          {activeTab === 'analytics' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" /> Analytics Dashboard
                  </h2>
                  <p className="text-xs text-slate-400">
                    Comprehensive analytics and insights for broadcast monitoring and royalty distribution.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as 'week' | 'month' | 'quarter' | 'year')}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="quarter">Last Quarter</option>
                    <option value="year">Last Year</option>
                  </select>
                </div>
              </div>

              {/* Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs text-slate-400">Total Royalties (6 months)</div>
                      <div className="text-xl font-bold text-amber-400 font-mono">
                        {formatUGX(stats.totalRoyalties)}
                      </div>
                    </div>
                    <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                    </div>
                  </div>
                  <div className="text-xs text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> +12.5% vs last period
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs text-slate-400">Peak Spin Day</div>
                      <div className="text-xl font-bold text-sky-400 font-mono">
                        {Math.max(...royaltyStatements.map(s => Object.values(s.stations).reduce((sum, station) => sum + station.plays, 0))).toLocaleString()}
                      </div>
                    </div>
                    <div className="w-8 h-8 bg-sky-500/20 rounded-lg flex items-center justify-center">
                      <Music className="w-4 h-4 text-sky-400" />
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {royaltyStatements[0]?.month || 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs text-slate-400">Top Performing Station</div>
                      <div className="text-xl font-bold text-purple-400 font-mono">
                        {stations.length > 0 ? stations[0].name : 'N/A'}
                      </div>
                    </div>
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Radio className="w-4 h-4 text-purple-400" />
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {stations.length > 0 ? `${stations[0].trackedSpins.toLocaleString()} spins` : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs text-slate-400">Most Played Track</div>
                      <div className="text-xl font-bold text-cyan-400 font-mono truncate max-w-[120px]">
                        {tracks.length > 0 ? tracks[0].title : 'N/A'}
                      </div>
                    </div>
                    <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                      <Music className="w-4 h-4 text-cyan-400" />
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {tracks.length > 0 ? `${tracks[0].plays.toLocaleString()} plays` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Regional Distribution Chart */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <PieChart className="w-4 h-4" /> Regional Spin Distribution
                  </h3>
                  <div className="space-y-3">
                    {['Central', 'Western', 'Eastern', 'Northern'].map(region => {
                      const regionStations = stations.filter(s => s.region === region);
                      const regionSpins = regionStations.reduce((sum, s) => sum + s.trackedSpins, 0);
                      const totalSpins = stations.reduce((sum, s) => sum + s.trackedSpins, 0);
                      const percentage = totalSpins > 0 ? (regionSpins / totalSpins * 100) : 0;
                      
                      return (
                        <div key={region} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-300">{region}</span>
                            <span className="text-xs text-slate-400">{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2">
                            <div 
                              className="bg-sky-400 h-2 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{regionSpins.toLocaleString()} spins</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Monthly Royalty Trend */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Monthly Royalty Trend
                  </h3>
                  <div className="space-y-3">
                    {royaltyStatements.slice(0, 6).reverse().map(statement => {
                      const maxRoyalties = Math.max(...royaltyStatements.map(s => s.totalRoyalties));
                      const percentage = maxRoyalties > 0 ? (statement.totalRoyalties / maxRoyalties * 100) : 0;
                      const displayPercentage = maxRoyalties > 0 ? ((statement.totalRoyalties / maxRoyalties * 100).toFixed(0)) : '0';
                      
                      return (
                        <div key={statement.month} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-300">
                              {new Date(statement.month).toLocaleString('en-UG', { month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatUGX(statement.totalRoyalties)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-3">
                            <div 
                              className="bg-amber-400 h-3 rounded-full transition-all"
                              style={{ width: `${Math.min(100, percentage)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{statement.totalPlays.toLocaleString()} plays</span>
                            <span className="text-emerald-400">{displayPercentage}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Tier Distribution */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg mt-6">
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <Radio className="w-4 h-4" /> Station Tier Distribution
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(['National', 'Regional', 'Community'] as StationTier[]).map(tier => {
                    const tierStations = stations.filter(s => s.tier === tier);
                    const tierRevenue = tierStations.reduce((sum, s) => sum + s.baseFee + (s.trackedSpins * s.perSpinRate), 0);
                    const tierSpins = tierStations.reduce((sum, s) => sum + s.trackedSpins, 0);
                    const config = TIER_CONFIG[tier];
                    
                    return (
                      <div key={tier} className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.color}`}>
                            {tier}
                          </span>
                          <span className="text-xs text-slate-400">{tierStations.length} stations</span>
                        </div>
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-slate-200 font-mono">
                            {formatUGX(tierRevenue)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {tierSpins.toLocaleString()} spins
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CATALOG MANAGEMENT */}
          {activeTab === 'catalog' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
              <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                <div>
                  <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                    <FileText className="w-5 h-5" /> Artist & Label Catalog Portal
                  </h2>
                  <p className="text-xs text-slate-400">
                    Manage registered works, view verified airplay spins, and track accrued earnings.
                  </p>
                </div>
                <button 
                  onClick={() => alert('New track registration form would open here. ISRC: Required field.')}
                  className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" /> Register New Track (ISRC)
                </button>
              </div>

              {/* Catalog Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-5 h-5 text-sky-400" />
                    <div>
                      <div className="text-xs text-slate-400">Total Catalog Tracks</div>
                      <div className="text-2xl font-bold text-sky-400 font-mono">{stats.totalTracks.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    <div>
                      <div className="text-xs text-slate-400">Active Artists</div>
                      <div className="text-2xl font-bold text-emerald-400 font-mono">{stats.totalArtists.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-xs text-slate-400">Total Catalog Spins</div>
                      <div className="text-2xl font-bold text-amber-400 font-mono">
                        {tracks.reduce((sum, t) => sum + t.plays, 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tracks Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">ISRC</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Artist</th>
                      <th className="p-3">Genre</th>
                      <th className="p-3">Release Date</th>
                      <th className="p-3">Total Plays</th>
                      <th className="p-3">Stations</th>
                      <th className="p-3">Estimated Royalties</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {tracks.slice(0, 20).map((track) => {
                      const estimatedRoyalties = track.plays * 350; // Average rate
                      
                      return (
                        <tr key={track.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-mono text-slate-300">{track.isrc}</td>
                          <td className="p-3 font-semibold text-slate-100">{track.title}</td>
                          <td className="p-3 text-slate-300">
                            {track.primaryArtist}
                            {track.featuredArtists.length > 0 && (
                              <span className="text-slate-500"> ft. {track.featuredArtists.join(', ')}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="bg-slate-800 border border-slate-700 text-cyan-400 text-xs px-2.5 py-1 rounded-full">
                              {track.genre}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400 font-mono">
                            {new Date(track.releaseDate).toLocaleDateString('en-UG', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            })}
                          </td>
                          <td className="p-3 font-bold text-sky-400 font-mono">{track.plays.toLocaleString()}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {track.stations.slice(0, 3).map(stationId => {
                                const station = stations.find(s => s.id === stationId);
                                return station ? (
                                  <span key={stationId} className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded">
                                    {station.name}
                                  </span>
                                ) : null;
                              })}
                              {track.stations.length > 3 && (
                                <span className="bg-slate-800 text-slate-500 text-xs px-2 py-0.5 rounded">
                                  +{track.stations.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-bold text-amber-400 font-mono">
                            {formatUGX(estimatedRoyalties)}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => alert(`Viewing details for: ${track.title} (${track.isrc})`)}
                                className="text-cyan-400 hover:text-cyan-300 transition-colors"
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => alert(`Editing: ${track.title}`)}
                                className="text-slate-400 hover:text-slate-300 transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete track: ${track.title}?`)) {
                                    alert('Track deleted successfully');
                                  }
                                }}
                                className="text-rose-400 hover:text-rose-300 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {tracks.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No tracks in catalog</p>
                  <p className="text-xs text-slate-600 mt-1">Register your first track to get started</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ARTIST & LABEL PORTAL VIEW */}
      {currentRole === 'ARTIST_LABEL' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
            <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                  <UserCheck className="w-5 h-5" /> Artist & Label Catalog Portal
                </h2>
                <p className="text-xs text-slate-400">
                  Manage registered works, view verified airplay spins, and track accrued earnings.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => alert('New track registration form would open here.')}
                  className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" /> Register New Track (ISRC)
                </button>
              </div>
            </div>

            {/* Artist Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-950 border border-cyan-500/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Music className="w-5 h-5 text-cyan-400" />
                  <div>
                    <div className="text-xs text-cyan-400/60">Total Catalog Spins</div>
                    <div className="text-2xl font-bold text-cyan-400 font-mono">
                      {tracks.reduce((sum, t) => sum + t.plays, 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-950 border border-emerald-500/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Radio className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-xs text-emerald-400/60">Active Stations Airing</div>
                    <div className="text-2xl font-bold text-emerald-400 font-mono">
                      {new Set(tracks.flatMap(t => t.stations)).size} Stations
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-950 border border-amber-500/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-xs text-amber-400/60">Estimated Accrued Royalties</div>
                    <div className="text-2xl font-bold text-amber-400 font-mono">
                      {formatUGX(tracks.reduce((sum, t) => sum + (t.plays * 350), 0))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Artist Tracks */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">ISRC</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Featured Artists</th>
                    <th className="p-3">Genre</th>
                    <th className="p-3">Plays</th>
                    <th className="p-3">Stations</th>
                    <th className="p-3">Estimated Royalties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tracks.slice(0, 10).map((track) => (
                    <tr key={track.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-mono text-slate-300">{track.isrc}</td>
                      <td className="p-3 font-semibold text-slate-100">{track.title}</td>
                      <td className="p-3 text-slate-300">
                        {track.featuredArtists.length > 0 ? track.featuredArtists.join(', ') : '-'}
                      </td>
                      <td className="p-3">
                        <span className="bg-slate-800 border border-slate-700 text-cyan-400 text-xs px-2.5 py-1 rounded-full">
                          {track.genre}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-sky-400 font-mono">{track.plays.toLocaleString()}</td>
                      <td className="p-3 text-slate-400">{track.stations.length}</td>
                      <td className="p-3 font-bold text-amber-400 font-mono">
                        {formatUGX(track.plays * 350)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Artist Analytics */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
            <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5" /> Your Performance Analytics
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Top Performing Tracks</h3>
                <div className="space-y-3">
                  {tracks.slice(0, 5).map((track, index) => (
                    <div key={track.id} className="flex items-center gap-3">
                      <span className="text-sm text-slate-500 w-5">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 truncate">{track.title}</div>
                        <div className="text-xs text-slate-400">{track.isrc}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sky-400 font-mono">{track.plays.toLocaleString()}</div>
                        <div className="text-xs text-slate-500">plays</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Station Reach</h3>
                <div className="space-y-3">
                  {stations.slice(0, 5).map((station, index) => {
                    const stationTracks = tracks.filter(t => t.stations.includes(station.id));
                    const stationPlays = stationTracks.reduce((sum, t) => sum + t.plays, 0);
                    
                    return (
                      <div key={station.id} className="flex items-center gap-3">
                        <span className="text-sm text-slate-500 w-5">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-200 truncate">{station.name}</div>
                          <div className="text-xs text-slate-400">{station.region}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-emerald-400 font-mono">{stationPlays.toLocaleString()}</div>
                          <div className="text-xs text-slate-500">plays</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BROADCASTER PORTAL VIEW */}
      {currentRole === 'BROADCASTER' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
            <h2 className="text-lg font-bold text-slate-100 mb-2 flex items-center gap-2">
              <Radio className="w-5 h-5" /> Broadcaster Compliance & Invoicing Portal
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              View live tracked airplay logs, statutory licensing tariff balances, and compliance status.
            </p>

            {/* Broadcaster Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                <div className="text-xs text-slate-400 mb-1">Your Station</div>
                <h3 className="text-xl font-bold text-sky-400 mb-2">
                  {stations.find(s => s.name === 'Capital FM')?.name || 'Capital FM (91.3 MHz Kampala)'}
                </h3>
                <span className="inline-block bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded border border-emerald-500/30">
                  LICENSED & COMPLIANT
                </span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                <div className="text-xs text-slate-400 mb-1">Current Month Spins</div>
                <div className="text-2xl font-bold text-amber-400 font-mono">
                  {stations.find(s => s.name === 'Capital FM')?.trackedSpins.toLocaleString() || '1,420'}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                <div className="text-xs text-slate-400 mb-1">Current Month Invoice</div>
                <div className="text-2xl font-bold text-emerald-400 font-mono">
                  {formatUGX(
                    (stations.find(s => s.name === 'Capital FM')?.baseFee || 5000000) + 
                    ((stations.find(s => s.name === 'Capital FM')?.trackedSpins || 1420) * 
                     (stations.find(s => s.name === 'Capital FM')?.perSpinRate || 2500))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Station Compliance */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
            <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5" /> Compliance Status
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Licensing Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Blanket License</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded border border-emerald-500/30">
                      ACTIVE
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Per-Spin Tariff</span>
                    <span className="font-mono text-slate-200">{formatUGX(2500)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Base Fee</span>
                    <span className="font-mono text-slate-200">{formatUGX(5000000)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Next Renewal</span>
                    <span className="text-slate-300">
                      {new Date().toLocaleDateString('en-UG', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Compliance Metrics</h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Compliance Score</span>
                      <span className="font-bold text-emerald-400">
                        {stations.find(s => s.name === 'Capital FM')?.complianceScore || 95}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div 
                        className="bg-emerald-400 h-2 rounded-full transition-all"
                        style={{ width: `${stations.find(s => s.name === 'Capital FM')?.complianceScore || 95}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Reporting Accuracy</span>
                    <span className="font-bold text-sky-400">98.5%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">License Adherence</span>
                    <span className="font-bold text-sky-400">100%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Payment History</span>
                    <span className="font-bold text-emerald-400">On Time</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
            <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5" /> Recent Activity
            </h2>

            <div className="space-y-4">
              {[
                { type: 'PLAY', title: 'New spin detected', message: 'Your track "African Giant" was played on Capital FM', time: '5 minutes ago' },
                { type: 'ROYALTY', title: 'Royalty accrued', message: 'UGX 2,500 earned from latest spin', time: '15 minutes ago' },
                { type: 'REPORT', title: 'Daily report generated', message: 'Your daily airplay report is ready for download', time: '2 hours ago' },
                { type: 'COMPLIANCE', title: 'Compliance check passed', message: 'All licensing requirements met for current period', time: '1 day ago' },
                { type: 'PAYMENT', title: 'Payment processed', message: 'Monthly royalty payment of UGX 8,550,000 processed', time: '3 days ago' },
              ].map((activity, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                    {activity.type === 'PLAY' && <Music className="w-4 h-4 text-sky-400" />}
                    {activity.type === 'ROYALTY' && <TrendingUp className="w-4 h-4 text-amber-400" />}
                    {activity.type === 'REPORT' && <FileText className="w-4 h-4 text-purple-400" />}
                    {activity.type === 'COMPLIANCE' && <Shield className="w-4 h-4 text-emerald-400" />}
                    {activity.type === 'PAYMENT' && <CheckCircle className="w-4 h-4 text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-200">{activity.title}</div>
                    <div className="text-xs text-slate-400">{activity.message}</div>
                  </div>
                  <div className="text-xs text-slate-500 flex-shrink-0">{activity.time}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl shadow-slate-900/50">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
              <Radio className="w-5 h-5" /> Quick Actions
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => alert('Download your current invoice')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-700 p-4 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                    <FileText className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">Download Invoice</div>
                    <div className="text-xs text-slate-400">Current month billing statement</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => alert('Submit your monthly compliance report')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-700 p-4 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                    <Shield className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">Submit Compliance Report</div>
                    <div className="text-xs text-slate-400">Monthly regulatory filing</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => alert('View and manage your payment history')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-700 p-4 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">Payment History</div>
                    <div className="text-xs text-slate-400">View past payments and receipts</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-500">
          EastSound Compliance & Royalty Studio | Powered by UPRS | 
          Uganda Performing Right Society | 
          {new Date().toLocaleDateString('en-UG', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}