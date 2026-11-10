# Plans, pricing and mobile money

_Written 10 November 2026._

## Why the pricing looks like this

SongBoost sells airplay tracking to Ugandan artists for **$10/month**, paid by mobile money. That is the
price anchor in this market, and it is a fair one. We match it — **UGX 35,000 a month** — instead of
undercutting it, because the difference is not price, it is what arrives with it: a 10-second clip per play,
statements, cue sheets, and the same data a CMO can distribute from.

Organisations pay for paperwork, not for access to the panel:

| Plan | Price | Who |
| --- | --- | --- |
| Artist | UGX 35,000 / mo | artists and managers |
| Label | UGX 250,000 / mo | labels and distributors |
| Broadcaster | quoted | radio and TV stations (cue sheets) |
| Venue | quoted | bars, clubs, hotels (UPRS compliance) |
| CMO licence | quoted | UPRS and collecting societies (pack + feed) |

Annual billing is ten months — two months free — and the figure is computed in `lib/plans.ts`, not typed into
a page, so the price on `/pricing`, in a receipt and in the database cannot drift apart.

## What actually happens when someone clicks "Start"

1. The person is signed in (or sent to sign up) and enters a Ugandan mobile-money number.
2. `normaliseMsisdn()` accepts `0772…`, `+2567…`, `2567…`, `772…` and stores one canonical form; landlines and
   short codes are rejected.
3. A row is inserted into `plan_requests` with a **reference** like `ES-ART-4F2C9A` — no I/O/0/1 characters,
   because it gets read aloud on a phone call.
4. The page shows the reference and promises a call. Nothing is charged, and no card is collected.

RLS rules on `plan_requests`:

- a person can **insert only their own** request, and only with `status = 'pending'`;
- they can **read their own**; a CMO can read all;
- a person can **cancel** their own (status → `cancelled`); only a CMO can move a request to `contacted` or
  `active`.

That last rule is the point: "active" is a billing decision, and it should not be possible from a browser.

## Adding real mobile money

When MTN MoMo (or Airtel Money) collection credentials exist:

1. Add a server route that creates a collection request for `amount_ugx` against `msisdn`, storing the
   provider reference on the `plan_requests` row.
2. Handle the provider callback: verify the signature, mark the row `active`, write an `alert_outbox` entry so
   the customer gets an email/WhatsApp confirmation, and record a receipt number.
3. Add a nightly reconciliation that flags `pending` rows older than 7 days — most will be abandoned requests,
   and a human should call, not retry automatically.
4. Keep the same reference. A person who pays should never have to match a second code to their account.

No card processing is planned: cards are rare for this audience and chargebacks are not a Ugandan small-label
problem.

## Where the request goes

`plan_requests` is a table, so it is visible in the Supabase dashboard today. When volume justifies it, a CMO
section ("Plan requests") can list pending rows and flip them to contacted/active. Until then, the alerting
path is the same one the rest of the system uses: a new row is a notification, not a dashboard someone has to
remember to open.

## Tests

`tests/plans.test.ts` (11 tests) — the UGX 35,000 anchor, annual = ten months, quoted plans never
auto-charged, unique plan ids, reference formatting (no ambiguous characters), and phone-number
normalisation for the forms Ugandans actually type.
