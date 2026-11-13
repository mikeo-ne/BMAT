# Optional catalogue-assisted song onboarding

These are suggestions for users to review, not proof of identity, ownership, songwriting,
royalty shares, or broadcast airplay. Saving still requires an authorised audio file. Multiple
songwriters and featured artists remain editable and no one is added as a writer by inference.
No YouTube statistics are collected here. Payments remain unchanged and off by default.

## Status and approval

Both new official-provider integrations are **off by default**. No access, production licence,
quota, pricing, permission to cache or display data, or artwork rights has been confirmed. The
implementation was tested with mocks; it has **not** been tested against Audiomack using approved
credentials. Review current provider contracts first. Do not activate simply because keys exist.

1. Apply migration `0029_catalog_rate_limit.sql` via the normal deployment process. It adds a
   shared database gate for the two providers. Routes fail closed if the gate is absent.
2. Agree to the applicable commercial, attribution and storage terms with each provider and
   record the approved use and quota. The shared gate admits at most one request per provider
   every two seconds across instances (not a guarantee of meeting a different contract limit).
   Only authenticated artist and label accounts may take a slot. Treat provider 429/503 as a
   stop/retry-later signal. If the provider requires a lower limit, change the implementation
   before enabling it. Operators must account for any other clients sharing the same provider IP.
3. Set the relevant server-only environment variables in the deployment secret/config manager,
   and enable the matching switch only after the agreement is in place. Deploy and run a small
   consented provider test. Roll back by setting the provider switch to `false` and redeploying.
   Never put keys in source control or client-side `NEXT_PUBLIC_` variables.

### MusicBrainz

Set `MUSICBRAINZ_ENABLED=true` and `MUSICBRAINZ_USER_AGENT` to a meaningful app/version and
real operator contact (per [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) and
[rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)). Read their
[licensing](https://musicbrainz.org/doc/MusicBrainz_Database) and distinguish hosted service
terms from data licensing. ISRC lookup returns recording/title/artist candidates; one ISRC
may have multiple recordings. A user chooses one before it becomes an unsaved editable form.
Additional artist credits are displayed for review but **not** converted into featured artists.
Release dates, writers, artwork, UPCs, masters and ownership are not imported from MusicBrainz.
Results are not persisted server-side and are returned with `Cache-Control: no-store`. Not found,
disabled, rate limited and provider errors have distinct messages. Demo mode does not make calls.

### Audiomack

After explicit permission, set `AUDIOMACK_API_ENABLED=true`, `AUDIOMACK_CONSUMER_KEY` and
`AUDIOMACK_CONSUMER_SECRET` in server configuration. The official client uses OAuth 1.0a
consumer-signed GETs for public song and album metadata only; it does **not** implement
user OAuth login or access private data. It parses only Audiomack HTTPS song/album URLs, calls
only `https://api.audiomack.com/v1/music/...`, refuses redirects, does not return streaming URLs
or fetch audio/artwork, and never logs the OAuth secret. Album track parsing requires complete
track details; it refuses incomplete or more than 40 tracks rather than silently omit tracks.
Unsupported formats or provider errors fall back to manual entry, not silent scraping when the
official switch is enabled. Only provider-labelled `featuring` names are suggested as features.
Review every result before saving and attach audio separately.

The earlier public-page Audiomack link resolver is **unchanged** when the official API switch
is off. That pre-existing path is not the official API and requires its own terms review. Once
the official switch is on, a missing credential, rate gate, malformed link or provider error
returns a clear failure; it does not silently revert to the public-page path. Multiple Audiomack
links in one batch can be rate-limited individually; retry them separately.

See [API assessment](api-assessment.md) for the small MusicBrainz experiment and links to
Audiomack's [official API documentation](https://audiomack.com/data-api/docs).
