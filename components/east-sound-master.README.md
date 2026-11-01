# Retired compliance prototype: compatibility entry point

`east-sound-master.tsx` is now a server-side alias for `CmoAuditWorkspace`.
The current `/dashboard/cmo` view and the legacy `/dashboard/cmo/master` and
`/dashboard/east-sound` URLs all render that same capture-backed workspace.

The former prototype generated random spins, station licence states,
infringements, overdue reports, payments and royalties. That implementation
and its unverified UPRS affiliation claims have been removed. Station directory
metadata and public release metadata do **not** establish any of those facts.

The shared workspace reads `readWorkspaceData()`. Empty capture history gives
an empty allocation ledger, no fabricated infringements and no payment claim.
Reported estimates use explicitly illustrative rates and supplied complete
ownership/identifier data; they are not official tariffs, compliance findings,
UPRS filings, authenticated signatures or money owed. A role-view selector is
not authentication or authorization.

For real integration boundaries, see `README.md`,
`docs/notifications-and-capture.md` and `docs/postgres-and-worker.md`.
