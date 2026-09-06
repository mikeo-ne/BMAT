/**
 * EastSound Compliance & Royalty Studio - Type Definitions
 * 
 * Type definitions for the EastSound Master Module component
 * and related data structures.
 */

// User roles for the system
export type UserRole = 'ARTIST_LABEL' | 'CMO_ADMIN' | 'BROADCASTER';

// Station classification tiers
export type StationTier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'National' | 'Regional' | 'Community';

// Station compliance and licensing status
export type StationStatus = 'ACTIVE' | 'UNLICENSED' | 'PENDING' | 'SUSPENDED';

// Infringement severity levels
export type InfringementSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

// Infringement case status
export type InfringementStatus = 'OPEN' | 'RESOLVED' | 'ESCALATED';

// Alert types
export type AlertType = 'INFRINGEMENT' | 'COMPLIANCE' | 'PAYMENT' | 'SYSTEM';

// Alert severity levels
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

// Ugandan regions
export type UgandanRegion = 'Central' | 'Western' | 'Eastern' | 'Northern';

// Date range options
export type DateRange = 'week' | 'month' | 'quarter' | 'year';

// Tab options for CMO_ADMIN
export type CmoAdminTab = 'calculator' | 'infringements' | 'catalog' | 'analytics' | 'alerts';

/**
 * Station billing and compliance information
 */
export interface StationBilling {
  id: string;
  name: string;
  region: UgandanRegion | string;
  location: string;
  frequency: string;
  tier: StationTier;
  baseFee: number; // in UGX
  perSpinRate: number; // in UGX per spin
  trackedSpins: number;
  status: StationStatus;
  reach: number; // estimated listeners
  lastReport: string; // ISO date string
  complianceScore: number; // 0-100 percentage
  medium?: 'FM' | 'TV';
  monitored?: boolean;
}

/**
 * Music track information with airplay data
 */
export interface Track {
  id: string;
  isrc: string; // International Standard Recording Code
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  duration: number; // in seconds
  genre: string;
  releaseDate: string; // ISO date string
  plays: number; // total tracked plays
  stations: string[]; // station IDs where track was played
  album?: string;
  label?: string;
  upc?: string; // Universal Product Code
}

/**
 * Royalty statement for a specific period
 */
export interface RoyaltyStatement {
  month: string; // 'YYYY-MM' format
  totalPlays: number;
  totalRoyalties: number; // in UGX
  stations: Record<string, { plays: number; royalties: number }>;
  tracks: Record<string, { plays: number; royalties: number }>;
  periodStart?: string;
  periodEnd?: string;
  generatedAt?: string;
}

/**
 * Copyright infringement detection record
 */
export interface Infringement {
  id: string;
  stationId: string;
  stationName: string;
  region: UgandanRegion | string;
  unlicensedSpins: number;
  detectedAt: string; // ISO date string
  severity: InfringementSeverity;
  status: InfringementStatus;
  evidence: string[]; // URLs or descriptions of evidence
  resolvedAt?: string;
  resolvedBy?: string;
  caseNumber?: string; // UPRS case reference
  notes?: string;
}

/**
 * System alert notification
 */
export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: string; // ISO date string
  severity: AlertSeverity;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Artist or label member information
 */
export interface ArtistMember {
  id: string;
  memberId: string; // UPRS member ID
  name: string;
  email?: string;
  phone?: string;
  works: number; // number of registered works
  role: 'PRIMARY' | 'FEATURED' | 'PRODUCER' | 'LABEL';
  joinDate: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

/**
 * Distribution report for royalty payouts
 */
export interface DistributionReport {
  generatedAt: string;
  period: string;
  totalPlays: number;
  totalRoyalties: number; // in UGX
  totalMembers: number;
  totalTracks: number;
  byStation: Record<string, { plays: number; royalties: number }>;
  byArtist: Record<string, { plays: number; royalties: number }>;
  byRegion: Record<UgandanRegion, { plays: number; royalties: number }>;
  allocations: MemberAllocation[];
}

/**
 * Individual member royalty allocation
 */
export interface MemberAllocation {
  memberId: string;
  artist: string;
  plays: number;
  stations: number; // number of stations where plays occurred
  works: number; // number of unique tracks
  allocationUgx: number;
  allocationUsd: number;
  shareOfPool: number; // percentage of total pool
}

/**
 * Tariff rate configuration
 */
export interface TariffRate {
  tier: StationTier;
  label: string;
  ugxPerPlay: number;
  baseFee: number;
  description?: string;
}

/**
 * Compliance metrics for a station
 */
export interface ComplianceMetrics {
  stationId: string;
  complianceScore: number; // 0-100
  reportingAccuracy: number; // 0-100
  licenseAdherence: number; // 0-100
  paymentHistory: 'ON_TIME' | 'LATE' | 'DELINQUENT';
  lastReportDate: string;
  nextReportDue: string;
  issues: ComplianceIssue[];
}

/**
 * Individual compliance issue
 */
export interface ComplianceIssue {
  id: string;
  type: 'REPORTING' | 'LICENSING' | 'PAYMENT' | 'TECHNICAL';
  description: string;
  severity: InfringementSeverity;
  status: InfringementStatus;
  detectedAt: string;
  resolvedAt?: string;
}

/**
 * Search and filter options
 */
export interface StationFilters {
  region?: UgandanRegion;
  tier?: StationTier;
  status?: StationStatus;
  search?: string;
  sortBy?: 'name' | 'region' | 'spins' | 'revenue' | 'compliance';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Track search and filter options
 */
export interface TrackFilters {
  artist?: string;
  genre?: string;
  isrc?: string;
  dateFrom?: string;
  dateTo?: string;
  minPlays?: number;
  station?: string;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
  message?: string;
  error?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  totalStations: number;
  activeStations: number;
  unlicensedStations: number;
  totalSpins: number;
  totalRevenue: number;
  totalTracks: number;
  totalArtists: number;
  totalRoyalties: number;
  averageCompliance: number;
  openInfringements: number;
  resolvedInfringements: number;
}

/**
 * Activity log entry
 */
export interface ActivityLog {
  id: string;
  type: 'PLAY' | 'ROYALTY' | 'REPORT' | 'COMPLIANCE' | 'PAYMENT' | 'SYSTEM';
  title: string;
  message: string;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * User preferences and settings
 */
export interface UserPreferences {
  role: UserRole;
  defaultTab?: CmoAdminTab;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  theme: 'dark' | 'light' | 'system';
  currency: 'UGX' | 'USD';
  dateFormat: string;
  timeZone: string;
}

/**
 * Configuration for the EastSound system
 */
export interface EastSoundConfig {
  cmoName: string;
  cmoFullName: string;
  ugxPerUsd: number;
  tariffs: Record<StationTier, TariffRate>;
  regions: UgandanRegion[];
  defaultDateRange: DateRange;
  complianceThresholds: {
    warning: number; // compliance score below which to warn
    critical: number; // compliance score below which to flag as critical
  };
  infringementThresholds: {
    minSpins: number; // minimum spins to trigger infringement
    detectionWindow: number; // in minutes
  };
}

// Default configuration
export const DEFAULT_CONFIG: EastSoundConfig = {
  cmoName: 'UPRS',
  cmoFullName: 'Uganda Performing Right Society',
  ugxPerUsd: 3720,
  tariffs: {
    'Tier 1': { tier: 'Tier 1', label: 'Tier 1 (National)', ugxPerPlay: 2500, baseFee: 5000000 },
    'Tier 2': { tier: 'Tier 2', label: 'Tier 2 (Regional)', ugxPerPlay: 1200, baseFee: 2500000 },
    'Tier 3': { tier: 'Tier 3', label: 'Tier 3 (Community)', ugxPerPlay: 500, baseFee: 1000000 },
    National: { tier: 'National', label: 'National FM', ugxPerPlay: 450, baseFee: 8000000 },
    Regional: { tier: 'Regional', label: 'Regional FM', ugxPerPlay: 300, baseFee: 3000000 },
    Community: { tier: 'Community', label: 'Community FM', ugxPerPlay: 180, baseFee: 1000000 },
  },
  regions: ['Central', 'Western', 'Eastern', 'Northern'],
  defaultDateRange: 'month',
  complianceThresholds: {
    warning: 80,
    critical: 60,
  },
  infringementThresholds: {
    minSpins: 10,
    detectionWindow: 15,
  },
};