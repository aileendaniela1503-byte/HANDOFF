# Handoff — Emergency Life Continuity

## What it does
For the moment you can't be there. Users quietly build a private "handoff profile" — pet care instructions, medications, dependents' routines, plants, home notes — with a small list of trusted contacts. When something happens, they (or a trusted contact) tap **Activate**, and every named contact instantly receives a secure, no-login page with exactly what they need to step in.

## MVP scope (this build)
- **Auth**: Emergent Google sign-in. New users are upserted by email.
- **Profiles**: Six types (pet, dependent, medication, plant, home, other) with a name, freeform care instructions, and an optional photo (Emergent Object Storage).
- **Trusted contacts**: Name, email/phone, relationship, notify order.
- **Activation flow**:
  - Confirmation sheet with a clear "Yes, activate now" action.
  - Backend generates a unique unguessable share token per contact.
  - Each contact is emailed via Emergent Resend with a link to a plain HTML page that works without an app or login.
  - Delivery status (sent / failed / pending) is shown to the user on the Active Event screen.
- **Public share view**: `/api/share/{token}/page` (backend HTML, sent in emails) and `/share/{token}` (in-app Expo route for anyone who has the app).
- **Resolve**: One tap expires every share link for that event.
- **Subscription UI**: Free / Handoff Plus / Family. Mocked — server updates `subscription_tier` but no billing.
- **Settings**: Sign out, delete account (cascades all data).

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
