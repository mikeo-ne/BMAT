-- Application identities are separate from the external integration/worker principals in migration 001.
CREATE TABLE east_sound.auth_users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES east_sound.tenants(id),
  email varchar(254) NOT NULL,
  display_name varchar(120) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('artist','broadcaster','cmo')),
  station_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(station_keys)='array'),
  password_hash text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,email),
  UNIQUE(tenant_id,id)
);
CREATE TABLE east_sound.auth_sessions (
  token_hash varchar(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES east_sound.auth_users(id) ON DELETE CASCADE,
  csrf_token varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_auth_sessions_user ON east_sound.auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expiry ON east_sound.auth_sessions(expires_at);
CREATE TABLE east_sound.auth_rate_limits (
  tenant_id uuid NOT NULL REFERENCES east_sound.tenants(id),
  key_hash varchar(64) NOT NULL,
  attempts integer NOT NULL CHECK(attempts>0),
  resets_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,key_hash)
);
CREATE TABLE east_sound.account_documents (
  tenant_id uuid NOT NULL REFERENCES east_sound.tenants(id),
  owner_id uuid NOT NULL,
  kind varchar(40) NOT NULL CHECK(kind ~ '^[a-z][a-z0-9_-]{0,39}$'),
  document_key varchar(160) NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,owner_id,kind,document_key),
  FOREIGN KEY(tenant_id,owner_id) REFERENCES east_sound.auth_users(tenant_id,id)
);
CREATE TABLE east_sound.security_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES east_sound.tenants(id),
  actor_id uuid,
  action varchar(80) NOT NULL,
  object_key varchar(200) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- A release contract cannot deliver two masters, including concurrent/retried requests.
CREATE UNIQUE INDEX idx_tracks_delivery_contract ON east_sound.tracks(tenant_id,(metadata->>'agreementId'))
  WHERE metadata->>'agreementId' IS NOT NULL;
CREATE INDEX idx_tracks_owner ON east_sound.tracks(tenant_id,(metadata->>'ownerId')) WHERE deleted_at IS NULL;

CREATE INDEX idx_security_audit_tenant_id ON east_sound.security_audit(tenant_id,id DESC);
