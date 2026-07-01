# Telephony: costs, responsibilities & "keep your number"

How phone numbers work on the platform, who pays for what, and why this keeps
the platform a **software layer** rather than a licensed telecom carrier.

## The model in one picture

```
Caller ──► Customer's number ──► [forwarded by customer's carrier] ──► Platform routing DID ──► AI
          (their carrier)          ← customer pays this leg →            ← platform pays this leg →
```

Customers **keep their own business number and contract**. They set up call
forwarding at their existing carrier so incoming calls are forwarded to a
platform-owned **routing DID**, where the AI assistant answers.

Two distinct numbers are involved:

| Number | Owned by | Lives on | In the data model |
|--------|----------|----------|-------------------|
| Customer's business number | The customer | Their existing carrier | `PhoneNumber.displayNumberEnc` (display metadata only) |
| **Routing DID** (forward target) | **The platform** | The platform's CPaaS account (Twilio/Telnyx) | `PhoneNumber.e164Enc/e164Hash` (used for routing) + `RoutingNumber` pool entry |

Inbound routing keys on the **dialed** number (`To`), i.e. the routing DID. The
customer's own number is never used for routing.

## Who pays for what

**Leg 1 — the forwarding leg (customer pays their own carrier).**
When the customer's carrier forwards a call to the routing DID, that is an
outbound call billed on the customer's own contract/tariff. **Not a platform
cost.** This is the key reason the platform does not carry regulated traffic.

**Leg 2 — inbound to the routing DID (platform pays the CPaaS).**
- DID rental: ~€1–2 / month per number (German geo/mobile; toll-free differs).
- Inbound minutes: ~€0.0075–0.01 / min (modeled by `TELEPHONY_PRICE_PER_MINUTE`).
- AI stack per minute: STT + LLM + TTS (already in the `UsageEvent` cost model).

The platform recovers Leg 2 through the plan fee plus usage markup
(`PLATFORM_MARKUP_PERCENT`).

## Responsibilities

- **Platform (you):** holds the CPaaS account, provisions & pays for routing
  DIDs, runs the AI. A **software/SaaS layer on top of the CPaaS**.
- **CPaaS (Twilio/Telnyx):** the **licensed carrier**. This is the regulatory
  firewall — they hold the telecom license; the platform resells software.
- **Customer:** keeps their number + contract, pays their carrier for the
  forwarding leg, and enables forwarding.

## Provisioning the routing DIDs

Numbers are provider-agnostic behind the telephony port
(`apps/api/src/services/telephony`): a Twilio adapter, a manual adapter, and a
Telnyx stub, selected by a factory. Two ways to fill the pool:

1. **Automatic (provider API):** when the CPaaS is fully configured, the
   super-admin console searches inventory and buys DIDs (webhook auto-wired).
2. **Manual (first-class fallback):** the operator buys a DID by hand in the
   provider console and registers its E.164 in the pool. This exists so GA is
   **not gated on any provider's regulatory bundle**.

> **German number caveat:** buying a German geographic DID via Twilio usually
> requires a regulatory bundle (proof of a local address), registered with the
> **platform's** business address (the platform owns the number — the customer
> ports nothing). Until that bundle is in place, use manual entry.

## The routing-number pool (closing the "who gives me the number?" gap)

Customers never type a routing number handed out by support. The platform keeps
a pool of platform-owned DIDs (`RoutingNumber`, status `available` → `assigned`):

- **Operator** fills the pool in the super-admin console
  (`/admin/routing-numbers`): add an already-owned DID, or search-and-buy.
- **Customer** picks "keep my number", enters only their own number + assistant.
  The backend (`POST /phone-numbers/keep-number`) **atomically claims** a free
  DID (or provisions one on demand if a provider API is available) and returns
  it, so the wizard shows exactly where to forward. If the pool is empty and no
  API is available, the customer gets a clear "contact support" message.
- Deleting the number **releases** its DID back to the pool for reuse.

## Alternatives

- **SIP trunk:** one trunk, many numbers — cheaper at scale, more setup. Offered
  as the "SIP-Trunk verbinden" path in the wizard.
- **New number:** for customers who don't have a number yet, the purchase path
  provisions a directly-dialed DID (no forwarding, `forwardingStatus` n/a).
