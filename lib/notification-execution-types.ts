export interface NotificationExecutionReadiness {
  liveEnabled: boolean;
  workerEnabled: boolean;
  providers: { whatsapp: boolean; email: boolean; webhook: boolean };
  immediateDispatchReady: boolean;
  scheduledRetriesConfigured: boolean;
  missing: string[];
  retrySchedule: "daily-safety-net";
}
