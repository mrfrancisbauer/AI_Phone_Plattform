# GDPR / Datenschutz

How the platform implements the data-protection requirements (spec §8).

## Privacy by design & data minimization

- **No audio is stored by default.** `assistants.recordAudio` defaults to `false`;
  only structured answers and the transcript text are kept. A tenant can opt in.
- Only data needed to handle the caller's request is collected — driven by the
  tenant's questionnaire.
- PII fields are **encrypted at rest** (AES-256-GCM): phone numbers, caller
  email, transcript turns, raw answer snippets, email recipients in logs.

## Consent (at the start of every call)

- The assistant reads a **configurable consent text** (`assistants.consentText`)
  before anything else, e.g.:
  > „Hinweis: Dieses Gespräch wird von einem KI-Assistenten geführt und zur
  > Bearbeitung Ihres Anliegens transkribiert. Sind Sie damit einverstanden?“
- **No consent → the assistant ends politely** (and can name an alternative
  contact). `consentGiven` is recorded on the call.
- The **caller summary email** is sent only if the caller provided an email
  address **and** explicitly consented during the call (`callerEmailConsent`).

## Access control & audit

- Access is **role-based** (see `docs/SECURITY.md`).
- Every read of call content (`GET /api/calls/:id`), export and delete is written
  to `audit_logs` with actor, IP and timestamp.

## Retention & deletion

- Per-tenant **retention period**: 7 / 30 / 90 / 180 days
  (`data_retention_settings.retentionDays`, default 90), editable in the
  dashboard under *Einstellungen → Datenschutz*.
- **Automatic deletion:** `services/retention.service.ts` deletes calls older
  than the window (cascading to messages, answers and summaries). Run it on a
  schedule via the standalone job:
  ```bash
  node dist/jobs/retention-cron.js     # e.g. daily cron
  ```
- **Manual deletion** of a single call: `DELETE /api/calls/:id` (dashboard:
  *Gespräch → Löschen*).

## Data-subject requests

- **Right of access (Art. 15):** `POST /api/gdpr/export { phone }` returns
  everything stored about that caller within the tenant (summaries, answers,
  transcript), decrypted for the authorized requester.
- **Right to erasure (Art. 17):** `POST /api/gdpr/erase { phone }` deletes all
  matching calls and returns the count.
- Both require the `calls:delete` capability and are audited.

## Hosting & processors

- Prefer an **EU region** for the database and all processors (Twilio/Telnyx,
  OpenAI, Resend …).
- Put **data-processing agreements (AVV/DPA)** in place with each processor.
- **No customer data is used to train any model** without explicit consent —
  the platform only sends data to the LLM provider for the immediate summary
  task, and the LLM step is optional (a local summarizer is the default).

## Mapping (spec §8)

| Requirement | Where |
|-------------|-------|
| Privacy by design / data minimization | no audio by default; questionnaire-scoped collection |
| Record vs. transcript-only choice | `assistants.recordAudio`, `data_retention_settings.storeAudio` |
| Configurable consent text | `assistants.consentText` |
| Decline handling | conversation engine `consent` phase → polite hangup |
| Encrypt PII | `lib/crypto.ts` |
| Role-based access | RBAC guards |
| Audit log of call-data access | `call.read` audit entry |
| Retention 7/30/90/180 + auto-delete | `data_retention_settings` + retention cron |
| Manual call deletion | `DELETE /api/calls/:id` |
| Export for access requests | `POST /api/gdpr/export` |
| Erasure for subject requests | `POST /api/gdpr/erase` |
| No training on customer data | LLM step optional; summary-only usage |
