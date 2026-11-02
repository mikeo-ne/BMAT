export type WebhookReceiptKind = "configuration-test" | "signed-external-alert";
export interface WebhookReceiptSummary {
  kind: WebhookReceiptKind;
  eventType: string;
  occurredAt: string;
  message: string;
  truncated: boolean;
  recording?: { title: string; artist: string };
  station?: { name: string; region: string };
}
export interface WebhookReceiptView {
  id: string;
  receivedAt: string;
  bodySha256: string;
  summary: WebhookReceiptSummary;
}
export interface WebhookReceiverView {
  id: string;
  label: string;
  enabled: boolean;
  generation: number;
  createdAt: string;
  updatedAt: string;
  endpointUrl: string | null;
  secretConfigured: boolean;
  receipts: WebhookReceiptView[];
}
export interface WebhookStorageStatus {
  available: boolean;
  reason:
    | "ready"
    | "postgres_required"
    | "migration_required"
    | "storage_unavailable";
}
