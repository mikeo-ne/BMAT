-- East Sound master entity schema (7H Music Group Ltd).
-- Brings the canonical Supabase-style entity structure into the dedicated
-- east_sound schema, adapted to project conventions:
--   - gen_random_uuid() instead of uuid-ossp/pgcrypto extensions
--   - tenant_id scoping where the capture pipeline requires it
--   - east_sound.auth_users as the identity table (Supabase auth.users equivalent)
--   - existing capture/notification tables (001/002) remain untouched
-- RLS policies are created for parity with the master schema but left
-- disabled; the application enforces RBAC at the API layer (requireApiRole).
-- Enable RLS only when deploying on Supabase with current_setting('east_sound.auth_uid', true)::uuid mapped.
SET LOCAL search_path = east_sound, pg_catalog;

-- --------------------------------------------------------------------
-- 1. ENUMS
-- --------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('cmo', 'label', 'artist', 'broadcaster', 'venue');
CREATE TYPE broadcast_type AS ENUM ('radio_fm', 'tv_digital', 'web_radio', 'web_tv');
CREATE TYPE stream_protocol AS ENUM ('icecast', 'hls', 'shoutcast', 'http_mp3', 'rtsp');
CREATE TYPE venue_category AS ENUM ('bar_lounge', 'nightclub', 'restaurant', 'hotel', 'event_space');
CREATE TYPE dispute_status AS ENUM ('pending', 'under_review', 'resolved', 'rejected');

-- --------------------------------------------------------------------
-- 2. PROFILES (extends auth_users with role + organization)
-- --------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES east_sound.auth_users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    email VARCHAR(254) NOT NULL,
    full_name VARCHAR(255),
    role user_role NOT NULL DEFAULT 'artist',
    organization_name VARCHAR(255),
    phone_number VARCHAR(50), -- +256… for WhatsApp alerts
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

-- Auto-create profile on account creation (mirrors Supabase handle_new_user).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, east_sound, pg_temp
AS $$
BEGIN
    INSERT INTO east_sound.profiles (id, tenant_id, email, role, full_name, organization_name)
    VALUES (
        NEW.id,
        NEW.tenant_id,
        NEW.email,
        COALESCE(NEW.role::user_role, 'artist'),
        NEW.display_name,
        NULL
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON east_sound.auth_users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Extend auth_users role check to include label and venue (master schema roles).
DO $$
DECLARE cname text;
BEGIN
    SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'east_sound.auth_users'::regclass
    AND contype = 'c' AND conname LIKE '%role%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE east_sound.auth_users DROP CONSTRAINT %I', cname);
    END IF;
END $$;
ALTER TABLE east_sound.auth_users
    ADD CONSTRAINT east_sound_auth_users_role_check
    CHECK (role IN ('artist','broadcaster','cmo','label','venue'));

-- --------------------------------------------------------------------
-- 3. LABELS & ARTISTS ROSTER
-- --------------------------------------------------------------------
CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    profile_id UUID NOT NULL REFERENCES east_sound.profiles(id) ON DELETE CASCADE,
    label_name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'Uganda',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

CREATE TABLE artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    profile_id UUID REFERENCES east_sound.profiles(id) ON DELETE SET NULL,
    label_id UUID REFERENCES east_sound.labels(id) ON DELETE SET NULL,
    stage_name VARCHAR(255) NOT NULL,
    real_name VARCHAR(255),
    isrc_prefix VARCHAR(10) NOT NULL DEFAULT 'UG-ESD',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

-- --------------------------------------------------------------------
-- 4. TRACK CATALOGUE & MASTER AUDIO METADATA
-- Merges master entity columns into the existing operational tracks table
-- (which retains tenant_id, external_key, metadata, deleted_at for the
-- capture pipeline).
-- --------------------------------------------------------------------
ALTER TABLE east_sound.tracks
    ADD COLUMN artist_id UUID REFERENCES east_sound.artists(id) ON DELETE SET NULL,
    ADD COLUMN label_id UUID REFERENCES east_sound.labels(id) ON DELETE SET NULL,
    ADD COLUMN upc VARCHAR(50),
    ADD COLUMN audio_file_url TEXT;

-- Track Rights & Split Sheets (ReSol Engine)
CREATE TABLE track_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    track_id UUID NOT NULL REFERENCES east_sound.tracks(id) ON DELETE CASCADE,
    contributor_name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL CHECK (role IN ('Producer','Composer','Writer','Publisher')),
    share_percentage NUMERIC(5,2) NOT NULL CHECK (share_percentage >= 0 AND share_percentage <= 100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

-- --------------------------------------------------------------------
-- 5. BROADCAST STATIONS & VENUE MONITORS (master entity layer)
-- --------------------------------------------------------------------
CREATE TABLE broadcast_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    profile_id UUID REFERENCES east_sound.profiles(id) ON DELETE SET NULL,
    station_name VARCHAR(255) NOT NULL,
    broadcast_type broadcast_type NOT NULL DEFAULT 'radio_fm',
    frequency_fm VARCHAR(50),
    region VARCHAR(100) NOT NULL DEFAULT 'Central',
    stream_url TEXT NOT NULL,
    protocol stream_protocol NOT NULL DEFAULT 'icecast',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_ping_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    profile_id UUID REFERENCES east_sound.profiles(id) ON DELETE SET NULL,
    venue_name VARCHAR(255) NOT NULL,
    category venue_category NOT NULL DEFAULT 'bar_lounge',
    district VARCHAR(100) NOT NULL DEFAULT 'Kampala',
    address TEXT,
    uprs_license_no VARCHAR(100),
    is_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

-- --------------------------------------------------------------------
-- 6. PLAYOUT LOGS (entity-level; distinct from partitioned airplay_logs)
-- --------------------------------------------------------------------
CREATE TABLE station_playout_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    station_id UUID NOT NULL REFERENCES east_sound.broadcast_stations(id) ON DELETE CASCADE,
    track_id UUID REFERENCES east_sound.tracks(id) ON DELETE SET NULL,
    matched_title VARCHAR(255) NOT NULL,
    matched_artist VARCHAR(255) NOT NULL,
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 99.00,
    playout_type VARCHAR(50) NOT NULL DEFAULT 'music',
    played_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

CREATE TABLE venue_playout_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    venue_id UUID NOT NULL REFERENCES east_sound.venues(id) ON DELETE CASCADE,
    track_id UUID REFERENCES east_sound.tracks(id) ON DELETE SET NULL,
    matched_title VARCHAR(255) NOT NULL,
    matched_artist VARCHAR(255) NOT NULL,
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 98.50,
    played_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

-- --------------------------------------------------------------------
-- 7. RIGHTS & DISPUTES FILING ENGINE
-- --------------------------------------------------------------------
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES east_sound.tenants(id),
    track_id UUID NOT NULL REFERENCES east_sound.tracks(id) ON DELETE CASCADE,
    filed_by_profile_id UUID NOT NULL REFERENCES east_sound.profiles(id) ON DELETE CASCADE,
    dispute_reason TEXT NOT NULL,
    status dispute_status NOT NULL DEFAULT 'pending',
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

-- --------------------------------------------------------------------
-- 8. RLS POLICIES (created for parity; disabled by default)
-- The application enforces RBAC at the API layer (requireApiRole).
-- Enable only when deploying on Supabase with current_setting('east_sound.auth_uid', true)::uuid mapped.
-- --------------------------------------------------------------------
ALTER TABLE east_sound.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.station_playout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.venue_playout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.disputes ENABLE ROW LEVEL SECURITY;

-- CMO auditor: universal read access.
CREATE POLICY cmo_full_access_profiles ON east_sound.profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM east_sound.profiles WHERE id = current_setting('east_sound.auth_uid', true)::uuid AND role = 'cmo')
);
CREATE POLICY cmo_full_access_tracks ON east_sound.tracks FOR SELECT USING (
    EXISTS (SELECT 1 FROM east_sound.profiles WHERE id = current_setting('east_sound.auth_uid', true)::uuid AND role = 'cmo')
);
CREATE POLICY cmo_full_access_station_logs ON east_sound.station_playout_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM east_sound.profiles WHERE id = current_setting('east_sound.auth_uid', true)::uuid AND role = 'cmo')
);
CREATE POLICY cmo_full_access_venue_logs ON east_sound.venue_playout_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM east_sound.profiles WHERE id = current_setting('east_sound.auth_uid', true)::uuid AND role = 'cmo')
);

-- Single artist: manage own catalogue.
CREATE POLICY artist_manage_own_tracks ON east_sound.tracks FOR ALL USING (
    artist_id IN (SELECT id FROM east_sound.artists WHERE profile_id = current_setting('east_sound.auth_uid', true)::uuid)
);
CREATE POLICY artist_view_own_station_plays ON east_sound.station_playout_logs FOR SELECT USING (
    track_id IN (
        SELECT t.id FROM east_sound.tracks t
        JOIN east_sound.artists a ON t.artist_id = a.id
        WHERE a.profile_id = current_setting('east_sound.auth_uid', true)::uuid
    )
);

-- Record label: manage roster tracks.
CREATE POLICY label_manage_roster_tracks ON east_sound.tracks FOR ALL USING (
    label_id IN (SELECT id FROM east_sound.labels WHERE profile_id = current_setting('east_sound.auth_uid', true)::uuid)
);

-- Broadcaster: station-specific playouts.
CREATE POLICY broadcaster_manage_own_logs ON east_sound.station_playout_logs FOR ALL USING (
    station_id IN (SELECT id FROM east_sound.broadcast_stations WHERE profile_id = current_setting('east_sound.auth_uid', true)::uuid)
);

-- Venue operator: venue-specific ambient logs.
CREATE POLICY venue_manage_own_logs ON east_sound.venue_playout_logs FOR ALL USING (
    venue_id IN (SELECT id FROM east_sound.venues WHERE profile_id = current_setting('east_sound.auth_uid', true)::uuid)
);

-- RLS is disabled by default in this deployment (application-layer RBAC).
-- The policies above are the canonical Supabase definitions; enable RLS
-- and map current_setting('east_sound.auth_uid', true)::uuid when deploying on Supabase.
ALTER TABLE east_sound.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.labels DISABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.artists DISABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.tracks DISABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.station_playout_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.venue_playout_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE east_sound.disputes DISABLE ROW LEVEL SECURITY;
