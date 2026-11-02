-- Private integration receivers are diagnostic ingress, NOT captured-airplay evidence.
-- Existing catalogue, identities, queues, rights and receipts are never reset.
CREATE TABLE east_sound.webhook_receivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES east_sound.tenants(id),
  owner_id uuid NOT NULL,
  label varchar(80) NOT NULL CHECK(length(btrim(label)) BETWEEN 2 AND 80),
  secret_ciphertext text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,owner_id) REFERENCES east_sound.auth_users(tenant_id,id)
);
CREATE INDEX idx_webhook_receivers_owner ON east_sound.webhook_receivers(tenant_id,owner_id,created_at);
CREATE TABLE east_sound.webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  event_key_hash varchar(64) NOT NULL CHECK(event_key_hash ~ '^[a-f0-9]{64}$'),
  body_sha256 varchar(64) NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=16384),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(tenant_id,receiver_id) REFERENCES east_sound.webhook_receivers(tenant_id,id),
  UNIQUE(tenant_id,receiver_id,event_key_hash)
);
CREATE INDEX idx_webhook_receipts_recent ON east_sound.webhook_receipts(tenant_id,receiver_id,received_at DESC,id DESC);
