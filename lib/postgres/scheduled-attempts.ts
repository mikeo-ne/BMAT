import "server-only";
import type { DeliveryAttempt } from "@/lib/notification-outbox";
import type { TransportResult } from "@/lib/notification-transport";
import { postgresPool, postgresTenant } from "@/lib/postgres/pool";

type AttemptRow = {
  id: string;
  channel: DeliveryAttempt["channel"];
  status: DeliveryAttempt["status"];
  attempts: number;
  created_at: Date;
  updated_at: Date;
  lease_until: Date | null;
  next_attempt_at: Date | null;
  code: string | null;
};
const toAttempt = (r: AttemptRow): DeliveryAttempt => ({
  id: r.id,
  channel: r.channel,
  status: r.status,
  attempts: r.attempts,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  ...(r.lease_until ? { leaseUntil: r.lease_until.toISOString() } : {}),
  ...(r.next_attempt_at
    ? { nextAttemptAt: r.next_attempt_at.toISOString() }
    : {}),
  ...(r.code ? { code: r.code } : {}),
});
export async function readPostgresAttempts(): Promise<DeliveryAttempt[]> {
  const result = await postgresPool().query<AttemptRow>(
    "SELECT * FROM east_sound.scheduled_delivery_attempts WHERE tenant_id=$1 ORDER BY created_at",
    [postgresTenant()],
  );
  return result.rows.map(toAttempt);
}
export async function claimPostgresAttempt(
  id: string,
  channel: DeliveryAttempt["channel"],
): Promise<DeliveryAttempt | null> {
  if (!id || id.length > 1600 || /[\r\n]/.test(id))
    throw new Error("Invalid delivery identity.");
  const tenant = postgresTenant(),
    pool = postgresPool();
  await pool.query(
    `UPDATE east_sound.scheduled_delivery_attempts SET status='failed',code='attempt_limit',updated_at=clock_timestamp(),lease_until=NULL,next_attempt_at=NULL
    WHERE tenant_id=$1 AND id=$2 AND attempts>=3 AND status IN ('attempting','retry') AND (lease_until IS NULL OR lease_until<=clock_timestamp())`,
    [tenant, id],
  );
  const result = await pool.query<AttemptRow>(
    `INSERT INTO east_sound.scheduled_delivery_attempts(tenant_id,id,channel,status,attempts,lease_until)
    VALUES ($1,$2,$3,'attempting',1,clock_timestamp()+interval '120 seconds')
    ON CONFLICT (tenant_id,id) DO UPDATE SET status='attempting',attempts=east_sound.scheduled_delivery_attempts.attempts+1,
      updated_at=clock_timestamp(),lease_until=clock_timestamp()+interval '120 seconds',next_attempt_at=NULL,code=NULL
    WHERE east_sound.scheduled_delivery_attempts.attempts<3 AND
      ((east_sound.scheduled_delivery_attempts.status='attempting' AND east_sound.scheduled_delivery_attempts.lease_until<=clock_timestamp()) OR
       (east_sound.scheduled_delivery_attempts.status='retry' AND east_sound.scheduled_delivery_attempts.next_attempt_at<=clock_timestamp())) RETURNING *`,
    [tenant, id, channel],
  );
  return result.rows[0] ? toAttempt(result.rows[0]) : null;
}
export async function finishPostgresAttempt(
  id: string,
  result: TransportResult,
  attempt: number,
): Promise<DeliveryAttempt["status"] | undefined> {
  const update = await postgresPool().query<{
    status: DeliveryAttempt["status"];
  }>(
    `UPDATE east_sound.scheduled_delivery_attempts
    SET status=CASE WHEN $4 THEN 'accepted' WHEN $5 AND attempts<3 THEN 'retry' ELSE 'failed' END,
      code=$6,updated_at=clock_timestamp(),lease_until=NULL,
      next_attempt_at=CASE WHEN NOT $4 AND $5 AND attempts<3 THEN clock_timestamp()+interval '60 seconds'*power(2,attempts-1) ELSE NULL END
    WHERE tenant_id=$1 AND id=$2 AND attempts=$3 AND status='attempting' AND lease_until>clock_timestamp() RETURNING status`,
    [
      postgresTenant(),
      id,
      attempt,
      result.accepted,
      result.retryable,
      /^[a-z0-9_-]{1,64}$/.test(result.code) ? result.code : "provider_result",
    ],
  );
  return update.rows[0]?.status;
}
