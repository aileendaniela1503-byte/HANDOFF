# Handoff — Emergency Life Continuity

## What it does
For the moment you can't be there. Users quietly build a private "handoff profile" — pet care instructions, medications, dependents' routines, plants, home notes — with a small list of trusted contacts. When something happens, they (or a trusted contact) tap **Activate**, and every named contact instantly receives a secure, no-login page with exactly what they need to step in.

## MVP scope (this build)
- **Auth**: Emergent Google sign-in. New users are upserted by email.
- **Profiles**: Six types (pet, dependent, medication, plant, home, other) with a name, freeform care instructions, optional photo (Emergent Object Storage), and optional **voice message** (recorded in-app via `expo-audio`, autoplays on the trusted contact's share page).
- **Voice tier gating**: Free tier gets voice on **1 profile**; Handoff Plus / Family: unlimited. Enforced server-side via `/api/quota` and 402 on write.
- **Trusted contacts**: Name, email/phone, relationship, notify order.

- **Two modes of sharing**:
  1. **Emergency Activation** — instant, one-tap, shares every profile with every trusted contact. Confirmation sheet, warm illustration, delivery status per contact, resolve to expire links.
  2. **Planned Handoff** — scheduled, time-boxed. User picks which profiles, which contacts, and a start/end datetime. Auto-activates at start (creates share tokens + sends emails), auto-expires at end. Editable while `scheduled`; cancellable at any time. Same underlying `activation_events` / `activation_shares` infrastructure, scoped by `profile_ids` on the share.
- **Activation email**:
  - Emergency and planned emails are worded differently ("needs your help" vs "shared a planned handoff with you", with an auto-expiry date line for planned).
  - Each contact gets a link to a plain HTML page that works without an app or login. Voice messages autoplay via `<audio autoplay>` on the HTML page and via `useAudioPlayer` in the in-app share screen.
  - Delivery status (sent / failed / pending / skipped_no_email) is shown to the user on the Active Event screen.
- **Public share view**: `/api/share/{token}/page` (backend HTML, sent in emails) and `/share/{token}` (in-app Expo route). Profile scoping is respected for planned handoffs.
- **Subscription UI**: Free / Handoff Plus / Family. Mocked — server updates `subscription_tier` but no billing.
- **Warm visual life**: Custom line-illustrations (dog on a porch, windowsill plant, park bench, house, medication bottle, cupped hands) and a subtle background dot texture.
- **Settings**: Sign out, delete account (cascades all data — events, shares, uploads).

## Known follow-ups (not blocking)
- Planned handoff time-based transitions are evaluated lazily on user reads. A tiny periodic worker will be added later so shares fire even if nobody polls between `start_at` and `end_at`.
- Real Stripe billing for the subscription tiers (currently the tier UI is functional but mocked).

## Tech
- Backend: FastAPI + Motor (MongoDB), routes prefixed `/api/*`.
- Auth: Emergent Google Auth (session_id → session_token → 7-day Bearer).
- Email: Emergent Resend via `EMERGENT_EMAIL_KEY`.
- Storage: Emergent Object Storage via `EMERGENT_LLM_KEY`.
- Frontend: Expo Router (React Native + web preview), safe-area aware, theme tokens from design guidelines. `Feather` icons.

## Out of scope for this iteration
- SMS delivery via Twilio (user provides keys → enable later).
- Real Stripe payments (subscription UI is mocked).
- Sign in with Apple / magic-link (single social provider for MVP).
- Biometric app lock (add via `expo-local-authentication` after real device build).
- Printable QR wallet card.

## Data model (MongoDB)
- `users`: user_id, email (unique), name, picture, subscription_tier, created_at
- `user_sessions`: session_token (unique), user_id, created_at, expires_at (TTL)
- `profiles`: profile_id, user_id, name, type, care_instructions, photo_path, created_at, updated_at
- `contacts`: contact_id, user_id, name, email, phone, relationship, notify_order, created_at
- `activation_events`: event_id, user_id, triggered_by, triggered_at, status, resolved_at
- `activation_shares`: share_token (unique), event_id, contact_id, delivery_status, delivered_at, viewed_at, photo_tokens
- `uploads`: path, owner_id, size, created_at
