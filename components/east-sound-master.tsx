/**
 * Compatibility entry point for the retired compliance prototype.
 * Never generate station licence status, infringements, spins, royalties or alerts.
 * All routes now share the same capture-backed CMO server workspace.
 */
export { CmoAuditWorkspace as default } from "@/components/cmo-audit-workspace";
