-- East Sound PostgreSQL 14+ persistence. Applied transactionally by db:migrate.
-- Dedicated schema: does not overwrite the older, unwired Prisma draft.
-- gen_random_uuid() is built into supported PostgreSQL; no extension privileges needed.
CREATE SCHEMA east_sound;
SET LOCAL search_path = east_sound, pg_catalog;

CREATE TYPE stream_type_enum AS ENUM ('fm', 'tv', 'online_stream');
CREATE TYPE alert_channel_enum AS ENUM ('whatsapp', 'email', 'webhook');
CREATE TYPE alert_trigger_type_enum AS ENUM ('first_spin', 'spin_milestone', 'prime_time', 'custom_threshold');
-- sent means provider-accepted, NOT delivered/read.
CREATE TYPE dispatch_status_enum AS ENUM ('pending', 'processing', 'sent', 'failed');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_key varchar(160) NOT NULL,
  name varchar(150) NOT NULL,
  call_sign varchar(50),
  frequency varchar(20),
  region varchar(50) NOT NULL CHECK (region IN ('Central','Eastern','Western','Northern')),
  location varchar(100) NOT NULL,
  country_code varchar(3) NOT NULL DEFAULT 'UGA',
  -- Directory entries do not imply licensed/connected streams.
  stream_url text CHECK (stream_url IS NULL OR stream_url ~ '^https://[^[:space:]]+$'),
  stream_type stream_type_enum NOT NULL DEFAULT 'fm',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, external_key),
  CHECK (NOT is_active OR stream_url IS NOT NULL)
);
CREATE TABLE tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_key varchar(160) NOT NULL,
  -- Public reference releases have UNKNOWN identifiers/masters/rights, not made-up ones.
  isrc varchar(15) CHECK (isrc IS NULL OR isrc ~ '^[A-Z]{2}-[A-Z0-9]{3}-[0-9]{2}-[0-9]{5}$'),
  iswc varchar(15), title varchar(255) NOT NULL, artist_name varchar(255) NOT NULL,
  label_name varchar(150), genre varchar(50),
  release_date date NOT NULL,
  duration_seconds double precision CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 86400)),
  fingerprint_hash text,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, external_key),
  CONSTRAINT tracks_tenant_isrc_key UNIQUE (tenant_id, isrc)
);
CREATE INDEX idx_tracks_isrc ON tracks(isrc) WHERE isrc IS NOT NULL;

-- Global local-reservation pool, not an official ISRC registry.
CREATE TABLE isrc_counters (reference_year smallint PRIMARY KEY, designation integer NOT NULL CHECK (designation BETWEEN 1 AND 99999));
CREATE TABLE isrc_reservations (isrc varchar(15) PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp());

-- Explicit watch entitlements. These are NOT rights ownership or authenticated signatures.
CREATE TABLE subscriber_track_access (
  tenant_id uuid NOT NULL, user_id uuid NOT NULL, track_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, user_id, track_id),
  FOREIGN KEY (tenant_id, track_id) REFERENCES tracks(tenant_id, id)
);
CREATE FUNCTION valid_milestones(values_ bigint[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, east_sound, pg_temp AS $$
  SELECT cardinality(values_) BETWEEN 1 AND 20 AND
    NOT EXISTS (SELECT 1 FROM unnest(values_) n WHERE n IS NULL OR n < 1 OR n > 1000000000)
$$;
CREATE TABLE notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL, -- UUID of an externally authenticated principal; not a browser role.
  external_key varchar(700) NOT NULL,
  track_id uuid, -- NULL = entitled tracks in THIS tenant, never every artist globally.
  station_id uuid,
  region varchar(50) CHECK (region IS NULL OR region IN ('Central','Eastern','Western','Northern')),
  channel alert_channel_enum NOT NULL,
  trigger_type alert_trigger_type_enum NOT NULL,
  destination text NOT NULL CHECK (length(destination) BETWEEN 1 AND 2048),
  webhook_kind varchar(20) NOT NULL DEFAULT 'json' CHECK (webhook_kind IN ('json','discord','telegram')),
  message_template text NOT NULL CHECK (length(message_template) BETWEEN 1 AND 1000),
  milestones bigint[] NOT NULL DEFAULT ARRAY[100,1000]::bigint[] CHECK (valid_milestones(milestones)),
  milestone_step bigint CHECK (milestone_step BETWEEN 1 AND 1000000000),
  custom_threshold bigint CHECK (custom_threshold BETWEEN 1 AND 1000000000),
  consented_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, user_id, external_key),
  FOREIGN KEY (tenant_id, track_id) REFERENCES tracks(tenant_id, id),
  FOREIGN KEY (tenant_id, station_id) REFERENCES stations(tenant_id, id),
  CHECK (NOT is_active OR consented_at IS NOT NULL),
  CHECK (trigger_type <> 'custom_threshold' OR custom_threshold IS NOT NULL),
  CHECK (channel <> 'whatsapp' OR (destination ~ '^\+[1-9][0-9]{7,14}$' AND (destination NOT LIKE '+256%' OR destination ~ '^\+256[1-9][0-9]{8}$'))),
  CHECK (channel <> 'email' OR (length(destination) <= 254 AND destination ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$')),
  CHECK (channel <> 'webhook' OR destination ~ '^https://[^[:space:]]+$')
);
CREATE INDEX idx_rules_active ON notification_rules(tenant_id, track_id) WHERE is_active;

CREATE TABLE airplay_logs (
  id bigserial,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_event_id varchar(160) NOT NULL CHECK (provider_event_id ~ '^[A-Za-z0-9:_-]+$'),
  station_id uuid NOT NULL,
  track_id uuid, -- Unmatched captures must not be assigned a fictional recording.
  played_at timestamptz(3) NOT NULL,
  duration_played double precision NOT NULL CHECK (duration_played > 0 AND duration_played <= 86400),
  confidence_score numeric(10,7) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  detected_isrc varchar(15) CHECK (detected_isrc IS NULL OR detected_isrc ~ '^[A-Z]{2}-[A-Z0-9]{3}-[0-9]{2}-[0-9]{5}$'),
  audio_snippet_url text,
  audio_snippet_sha256 varchar(64),
  snippet_duration integer,
  daypart varchar(20) NOT NULL DEFAULT 'Standard',
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, played_at, id),
  FOREIGN KEY (tenant_id, station_id) REFERENCES stations(tenant_id, id),
  FOREIGN KEY (tenant_id, track_id) REFERENCES tracks(tenant_id, id),
  CHECK ((audio_snippet_url IS NULL AND audio_snippet_sha256 IS NULL AND snippet_duration IS NULL) OR
    (audio_snippet_url IS NOT NULL AND audio_snippet_url ~ '^https://[^[:space:]]+$' AND audio_snippet_sha256 IS NOT NULL AND audio_snippet_sha256 ~ '^[a-f0-9]{64}$' AND snippet_duration IS NOT NULL AND snippet_duration = 10))
) PARTITION BY RANGE (played_at);
CREATE INDEX idx_airplay_station_time ON airplay_logs(tenant_id, station_id, played_at DESC);
CREATE INDEX idx_airplay_track_time ON airplay_logs(tenant_id, track_id, played_at DESC);
CREATE INDEX idx_airplay_time ON airplay_logs(tenant_id, played_at DESC);

-- Cross-partition deduplication. A partitioned table cannot have a unique key
-- that omits its partition key; a BIGINT alone is not a valid log foreign key.
CREATE TABLE airplay_event_keys (
  tenant_id uuid NOT NULL, provider_event_id varchar(160) NOT NULL,
  played_at timestamptz(3) NOT NULL, airplay_log_id bigint NOT NULL,
  fingerprint jsonb NOT NULL,
  PRIMARY KEY (tenant_id, provider_event_id),
  FOREIGN KEY (tenant_id, played_at, airplay_log_id)
    REFERENCES airplay_logs(tenant_id, played_at, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE track_spin_totals (
  tenant_id uuid NOT NULL, track_id uuid NOT NULL, spins bigint NOT NULL CHECK (spins > 0),
  first_played_at timestamptz NOT NULL, last_played_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, track_id),
  FOREIGN KEY (tenant_id, track_id) REFERENCES tracks(tenant_id, id)
);
CREATE TABLE track_daily_spins (
  tenant_id uuid NOT NULL, track_id uuid NOT NULL, eat_day date NOT NULL, spins bigint NOT NULL CHECK (spins > 0),
  PRIMARY KEY (tenant_id, track_id, eat_day),
  FOREIGN KEY (tenant_id, track_id) REFERENCES tracks(tenant_id, id)
);
CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  rule_id uuid NOT NULL, rule_generation uuid NOT NULL,
  track_id uuid NOT NULL,
  airplay_log_id bigint NOT NULL, airplay_played_at timestamptz(3) NOT NULL,
  dedupe_key varchar(700) NOT NULL,
  channel alert_channel_enum NOT NULL,
  destination text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status dispatch_status_enum NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid, lease_expires_at timestamptz,
  error_code varchar(64) CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_-]{1,64}$'),
  provider_id varchar(512),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz,
  FOREIGN KEY (tenant_id, rule_id) REFERENCES notification_rules(tenant_id, id),
  FOREIGN KEY (tenant_id, track_id) REFERENCES tracks(tenant_id, id),
  FOREIGN KEY (tenant_id, airplay_played_at, airplay_log_id) REFERENCES airplay_logs(tenant_id, played_at, id),
  UNIQUE (rule_id, rule_generation, track_id, dedupe_key),
  CHECK (attempts BETWEEN 0 AND max_attempts),
  CHECK ((status = 'processing' AND attempts > 0 AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND processed_at IS NULL) OR
    (status = 'pending' AND lease_token IS NULL AND lease_expires_at IS NULL AND processed_at IS NULL) OR
    (status IN ('sent','failed') AND lease_token IS NULL AND lease_expires_at IS NULL AND processed_at IS NOT NULL))
);
CREATE INDEX idx_outbox_pending ON notification_outbox(tenant_id, available_at, created_at) WHERE status = 'pending';
CREATE INDEX idx_outbox_leases ON notification_outbox(tenant_id, lease_expires_at) WHERE status = 'processing';

CREATE FUNCTION ensure_airplay_partition(at_ timestamptz) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, east_sound, pg_temp AS $$
DECLARE month_ date := date_trunc('month', at_ AT TIME ZONE 'UTC')::date;
        name_ text := 'airplay_logs_' || to_char(month_, 'YYYY_MM');
BEGIN
  IF to_regclass('east_sound.' || name_) IS NOT NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(1950421, extract(year FROM month_)::int * 100 + extract(month FROM month_)::int);
  IF to_regclass('east_sound.' || name_) IS NULL THEN
    EXECUTE format('CREATE TABLE east_sound.%I PARTITION OF east_sound.airplay_logs FOR VALUES FROM (%L) TO (%L)',
      name_, month_::text || ' 00:00:00+00', (month_ + interval '1 month')::date::text || ' 00:00:00+00');
  END IF;
END $$;
SELECT ensure_airplay_partition(month_ AT TIME ZONE 'UTC')
FROM generate_series(date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 month',
  date_trunc('month', now() AT TIME ZONE 'UTC') + interval '3 months', interval '1 month') month_;

CREATE FUNCTION validate_and_dedupe_airplay() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, east_sound, pg_temp AS $$
DECLARE station_ stations%ROWTYPE; track_ tracks%ROWTYPE;
        hash_ jsonb; old_hash_ jsonb; inserted_ integer; hour_ integer;
BEGIN
  SELECT * INTO STRICT station_ FROM stations WHERE tenant_id = NEW.tenant_id AND id = NEW.station_id;
  IF NEW.played_at > clock_timestamp() THEN RAISE EXCEPTION 'future capture' USING ERRCODE = '23514'; END IF;
  IF NEW.track_id IS NOT NULL THEN
    SELECT * INTO STRICT track_ FROM tracks WHERE tenant_id = NEW.tenant_id AND id = NEW.track_id AND deleted_at IS NULL;
    IF (NEW.played_at AT TIME ZONE 'Africa/Kampala')::date < track_.release_date THEN
      RAISE EXCEPTION 'capture predates release' USING ERRCODE = '23514';
    END IF;
    IF NEW.detected_isrc IS NOT NULL AND track_.isrc IS NOT NULL AND NEW.detected_isrc <> track_.isrc THEN
      RAISE EXCEPTION 'capture ISRC differs from matched recording' USING ERRCODE = '23514';
    END IF;
  END IF;
  hash_ := jsonb_build_array(NEW.station_id, NEW.track_id, NEW.played_at, NEW.duration_played,
    NEW.confidence_score, NEW.detected_isrc, NEW.audio_snippet_url, NEW.audio_snippet_sha256, NEW.snippet_duration);
  INSERT INTO airplay_event_keys(tenant_id, provider_event_id, played_at, airplay_log_id, fingerprint)
    VALUES(NEW.tenant_id, NEW.provider_event_id, NEW.played_at, NEW.id, hash_)
    ON CONFLICT (tenant_id, provider_event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_ = ROW_COUNT;
  IF inserted_ = 0 THEN
    SELECT fingerprint INTO old_hash_ FROM airplay_event_keys WHERE tenant_id = NEW.tenant_id AND provider_event_id = NEW.provider_event_id;
    IF old_hash_ IS DISTINCT FROM hash_ THEN
      RAISE EXCEPTION 'immutable provider event conflict' USING ERRCODE = '23505', CONSTRAINT = 'airplay_provider_event_conflict';
    END IF;
    RETURN NULL;
  END IF;
  hour_ := extract(hour FROM NEW.played_at AT TIME ZONE 'Africa/Kampala');
  NEW.daypart := CASE WHEN hour_ >= 6 AND hour_ < 10 THEN 'Morning Drive' WHEN hour_ >= 16 AND hour_ < 20 THEN 'Evening Drive'
    WHEN hour_ >= 22 OR hour_ < 6 THEN 'Night' ELSE 'Standard' END;
  NEW.record := jsonb_build_object('id', NEW.provider_event_id, 'stationId', station_.external_key, 'stationName', station_.name,
    'region', station_.region, 'medium', CASE station_.stream_type WHEN 'fm' THEN 'FM' WHEN 'tv' THEN 'TV' ELSE 'ONLINE' END,
    'detectedAt', to_char(NEW.played_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'trackId', track_.external_key, 'title', track_.title, 'primaryArtist', track_.artist_name, 'isrc', NEW.detected_isrc,
    'durationSec', NEW.duration_played, 'confidence', NEW.confidence_score / 100, 'source', 'captured') ||
    CASE WHEN NEW.audio_snippet_url IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('evidence', jsonb_build_object('url', NEW.audio_snippet_url, 'sha256', NEW.audio_snippet_sha256)) END;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_airplay BEFORE INSERT ON airplay_logs FOR EACH ROW EXECUTE FUNCTION validate_and_dedupe_airplay();

CREATE FUNCTION enqueue_airplay_alerts() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, east_sound, pg_temp AS $$
DECLARE total_ bigint; today_ bigint; rule_ notification_rules%ROWTYPE; station_ stations%ROWTYPE;
        track_ tracks%ROWTYPE; key_ text; hour_ integer; matches_ boolean;
BEGIN
  SELECT * INTO STRICT station_ FROM stations WHERE tenant_id = NEW.tenant_id AND id = NEW.station_id;
  IF NEW.track_id IS NULL OR station_.stream_type <> 'fm' THEN RETURN NEW; END IF;
  SELECT * INTO STRICT track_ FROM tracks WHERE tenant_id = NEW.tenant_id AND id = NEW.track_id;
  -- An atomic per-track UPSERT serializes concurrent first plays. Never COUNT(*) all history.
  INSERT INTO track_spin_totals(tenant_id, track_id, spins, first_played_at, last_played_at)
    VALUES(NEW.tenant_id, NEW.track_id, 1, NEW.played_at, NEW.played_at)
    ON CONFLICT (tenant_id, track_id) DO UPDATE SET spins = track_spin_totals.spins + 1,
      first_played_at = least(track_spin_totals.first_played_at, excluded.first_played_at),
      last_played_at = greatest(track_spin_totals.last_played_at, excluded.last_played_at)
    RETURNING spins INTO total_;
  INSERT INTO track_daily_spins(tenant_id, track_id, eat_day, spins)
    VALUES(NEW.tenant_id, NEW.track_id, (NEW.played_at AT TIME ZONE 'Africa/Kampala')::date, 1)
    ON CONFLICT (tenant_id, track_id, eat_day) DO UPDATE SET spins = track_daily_spins.spins + 1
    RETURNING spins INTO today_;
  hour_ := extract(hour FROM NEW.played_at AT TIME ZONE 'Africa/Kampala');
  FOR rule_ IN SELECT r.* FROM notification_rules r
    JOIN subscriber_track_access a ON a.tenant_id = r.tenant_id AND a.user_id = r.user_id AND a.track_id = NEW.track_id
    WHERE r.tenant_id = NEW.tenant_id AND r.is_active AND r.consented_at IS NOT NULL
      AND NEW.played_at >= r.activated_at
      AND (r.track_id IS NULL OR r.track_id = NEW.track_id)
      AND (r.station_id IS NULL OR r.station_id = NEW.station_id)
      AND (r.region IS NULL OR r.region = station_.region)
  LOOP
    matches_ := CASE rule_.trigger_type
      WHEN 'first_spin' THEN total_ = 1
      WHEN 'spin_milestone' THEN total_ = ANY(rule_.milestones) OR (rule_.milestone_step IS NOT NULL AND total_ % rule_.milestone_step = 0)
      WHEN 'custom_threshold' THEN total_ = rule_.custom_threshold
      WHEN 'prime_time' THEN station_.external_key IN ('capital-kla','cbs-kla','galaxy-kla') AND ((hour_ >= 6 AND hour_ < 10) OR (hour_ >= 16 AND hour_ < 20))
      ELSE false END;
    IF NOT matches_ THEN CONTINUE; END IF;
    key_ := rule_.trigger_type::text || ':' || CASE WHEN rule_.trigger_type = 'prime_time' THEN NEW.provider_event_id ELSE total_::text END;
    INSERT INTO notification_outbox(tenant_id, rule_id, rule_generation, track_id, airplay_log_id, airplay_played_at,
      dedupe_key, channel, destination, payload)
    VALUES(NEW.tenant_id, rule_.id, rule_.generation, NEW.track_id, NEW.id, NEW.played_at,
      key_, rule_.channel, rule_.destination,
      jsonb_build_object('source','captured','event',rule_.trigger_type,'spinId',NEW.provider_event_id,'trackId',track_.external_key,
        'title',track_.title,'artist',track_.artist_name,'stationId',station_.external_key,'station',station_.name,'region',station_.region,
        'location',station_.location,'atIso',NEW.record->>'detectedAt','ordinal',total_,'spinsToday',today_,
        'template',rule_.message_template,'webhookKind',rule_.webhook_kind))
    ON CONFLICT (rule_id, rule_generation, track_id, dedupe_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enqueue_airplay AFTER INSERT ON airplay_logs FOR EACH ROW EXECUTE FUNCTION enqueue_airplay_alerts();

-- Idempotent administrative configuration replacement (contacts remain private).
CREATE TABLE notification_configs (
  tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
  sha256 varchar(64) NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,user_id)
);
-- Existing scheduled daily/weekly HTTP digests use a shared database attempt
-- ledger. They are period-derived jobs, not individual-airplay trigger rows.
CREATE TABLE scheduled_delivery_attempts (
  tenant_id uuid NOT NULL REFERENCES tenants(id), id varchar(1600) NOT NULL,
  channel alert_channel_enum NOT NULL,
  status varchar(12) NOT NULL CHECK (status IN ('attempting','accepted','retry','failed')),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_until timestamptz, next_attempt_at timestamptz, code varchar(64),
  PRIMARY KEY (tenant_id,id)
);
CREATE FUNCTION rotate_rule_generation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, east_sound, pg_temp AS $$
BEGIN
  IF ROW(NEW.tenant_id,NEW.user_id,NEW.external_key,NEW.is_active,NEW.consented_at,NEW.destination,NEW.channel,NEW.trigger_type,NEW.message_template,
    NEW.track_id,NEW.station_id,NEW.region,NEW.milestones,NEW.milestone_step,NEW.custom_threshold,NEW.webhook_kind)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.user_id,OLD.external_key,OLD.is_active,OLD.consented_at,OLD.destination,OLD.channel,OLD.trigger_type,OLD.message_template,
    OLD.track_id,OLD.station_id,OLD.region,OLD.milestones,OLD.milestone_step,OLD.custom_threshold,OLD.webhook_kind) THEN
    NEW.generation := gen_random_uuid(); NEW.activated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_rule_generation BEFORE UPDATE ON notification_rules FOR EACH ROW EXECUTE FUNCTION rotate_rule_generation();
