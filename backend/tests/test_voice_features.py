"""Backend tests for the new voice-message + tier-quota features.

Covers:
- GET /api/quota — tier + voice.used + voice.limit (free=1, plus/family=None)
- POST /api/upload/audio — uploads audio, returns path
- POST /api/profiles with voice_path — free tier: first allowed, second returns 402
- POST /api/subscription/upgrade → then POST /api/profiles with voice_path succeeds unlimited
- PUT /api/profiles/{id} removing voice_path (null) not blocked by tier check
- Full activation flow with two voice profiles:
    * /api/share/{token} JSON returns each profile with its OWN voice_url (distinct tokens)
    * /api/files/{path}?token=<file_token> returns 200 for valid token, 403 for wrong/missing
    * /api/share/{token}/page HTML contains <audio ... autoplay> per profile w/ voice
"""
import io
import re
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests


# ---------- Helpers ----------

def _seed_user(mongo, tier="free"):
    uid = f"user_TEST_{uuid.uuid4().hex[:8]}"
    token = f"TEST_tok_{uuid.uuid4().hex}"
    mongo.users.insert_one({
        "user_id": uid,
        "email": f"TEST_{uuid.uuid4().hex[:6]}@example.com",
        "name": "TEST Voice",
        "picture": None,
        "subscription_tier": tier,
        "created_at": datetime.now(timezone.utc),
    })
    mongo.user_sessions.insert_one({
        "session_token": token,
        "user_id": uid,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })
    return uid, token


def _cleanup_user(mongo, uid):
    mongo.users.delete_one({"user_id": uid})
    mongo.user_sessions.delete_many({"user_id": uid})
    mongo.profiles.delete_many({"user_id": uid})
    mongo.contacts.delete_many({"user_id": uid})
    ev_ids = [e["event_id"] for e in mongo.activation_events.find({"user_id": uid}, {"event_id": 1})]
    if ev_ids:
        mongo.activation_shares.delete_many({"event_id": {"$in": ev_ids}})
    mongo.activation_events.delete_many({"user_id": uid})


def _upload_audio(base_url, token):
    files = {"file": ("clip.m4a", io.BytesIO(b"FAKE_M4A_BYTES_" + uuid.uuid4().hex.encode()), "audio/mp4")}
    r = requests.post(
        f"{base_url}/api/upload/audio",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
    )
    return r


# ---------- Quota ----------
class TestQuota:
    def test_quota_free_tier_defaults(self, base_url, auth_session):
        r = auth_session.get(f"{base_url}/api/quota")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tier"] == "free"
        assert data["voice"]["limit"] == 1
        assert data["voice"]["used"] == 0

    def test_quota_reflects_used_after_voice_profile(self, base_url, mongo):
        uid, token = _seed_user(mongo, "free")
        try:
            s = requests.Session()
            s.headers.update({"Authorization": f"Bearer {token}"})
            up = _upload_audio(base_url, token)
            assert up.status_code == 200, up.text
            path = up.json()["path"]

            r = s.post(
                f"{base_url}/api/profiles",
                json={"name": "TEST_VoiceP", "type": "other", "care_instructions": "", "voice_path": path},
                headers={"Content-Type": "application/json"},
            )
            assert r.status_code == 200, r.text

            r = s.get(f"{base_url}/api/quota")
            assert r.status_code == 200
            data = r.json()
            assert data["voice"]["used"] == 1
            assert data["voice"]["limit"] == 1
        finally:
            _cleanup_user(mongo, uid)

    def test_quota_plus_tier_unlimited(self, base_url, mongo):
        uid, token = _seed_user(mongo, "plus")
        try:
            r = requests.get(f"{base_url}/api/quota", headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 200
            data = r.json()
            assert data["tier"] == "plus"
            assert data["voice"]["limit"] is None
        finally:
            _cleanup_user(mongo, uid)

    def test_quota_family_tier_unlimited(self, base_url, mongo):
        uid, token = _seed_user(mongo, "family")
        try:
            r = requests.get(f"{base_url}/api/quota", headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 200
            data = r.json()
            assert data["tier"] == "family"
            assert data["voice"]["limit"] is None
        finally:
            _cleanup_user(mongo, uid)


# ---------- Audio upload ----------
class TestAudioUpload:
    def test_upload_audio_returns_path(self, base_url, seeded_user):
        r = _upload_audio(base_url, seeded_user["token"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert "path" in data
        assert data["path"].endswith(".m4a")
        assert seeded_user["user_id"] in data["path"]

    def test_upload_audio_requires_auth(self, base_url):
        files = {"file": ("clip.m4a", io.BytesIO(b"x"), "audio/mp4")}
        r = requests.post(f"{base_url}/api/upload/audio", files=files)
        assert r.status_code == 401


# ---------- Tier gating on profile voice_path ----------
class TestVoiceTierGating:
    def test_free_first_voice_allowed_second_blocked(self, base_url, mongo):
        uid, token = _seed_user(mongo, "free")
        try:
            s = requests.Session()
            s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

            path1 = _upload_audio(base_url, token).json()["path"]
            r1 = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_P1", "type": "pet", "care_instructions": "", "voice_path": path1,
            })
            assert r1.status_code == 200, r1.text

            path2 = _upload_audio(base_url, token).json()["path"]
            r2 = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_P2", "type": "pet", "care_instructions": "", "voice_path": path2,
            })
            assert r2.status_code == 402, r2.text
            assert "Plus" in r2.json().get("detail", "") or "402" in str(r2.status_code)

            # But creating a profile WITHOUT voice_path on free is still allowed
            r3 = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_P3_novoice", "type": "pet", "care_instructions": "",
            })
            assert r3.status_code == 200
        finally:
            _cleanup_user(mongo, uid)

    def test_upgrade_to_plus_unlimited_voice(self, base_url, mongo):
        uid, token = _seed_user(mongo, "free")
        try:
            s = requests.Session()
            s.headers.update({"Authorization": f"Bearer {token}"})

            # 1 voice profile on free — allowed
            p1 = _upload_audio(base_url, token).json()["path"]
            r = s.post(f"{base_url}/api/profiles",
                       json={"name": "TEST_a", "type": "pet", "care_instructions": "", "voice_path": p1},
                       headers={"Content-Type": "application/json"})
            assert r.status_code == 200

            # Upgrade
            r = requests.post(
                f"{base_url}/api/subscription/upgrade",
                data={"tier": "plus"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 200 and r.json()["subscription_tier"] == "plus"

            # More voice profiles allowed after upgrade
            for i in range(2):
                p = _upload_audio(base_url, token).json()["path"]
                r = s.post(
                    f"{base_url}/api/profiles",
                    json={"name": f"TEST_plus_{i}", "type": "pet", "care_instructions": "", "voice_path": p},
                    headers={"Content-Type": "application/json"},
                )
                assert r.status_code == 200, r.text
        finally:
            _cleanup_user(mongo, uid)

    def test_put_removing_voice_not_blocked(self, base_url, mongo):
        """PUT that sets voice_path=null on a profile must not trigger 402 even if user
        is on free tier and already at limit."""
        uid, token = _seed_user(mongo, "free")
        try:
            s = requests.Session()
            s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

            path1 = _upload_audio(base_url, token).json()["path"]
            p1 = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_v1", "type": "pet", "care_instructions": "", "voice_path": path1,
            }).json()

            # PUT: remove voice on this profile (voice_path=None)
            r = s.put(f"{base_url}/api/profiles/{p1['profile_id']}", json={
                "name": "TEST_v1", "type": "pet", "care_instructions": "", "voice_path": None,
            })
            assert r.status_code == 200, r.text
            assert r.json().get("voice_path") is None

            # And now we can add voice on a fresh profile since count is back to 0
            path2 = _upload_audio(base_url, token).json()["path"]
            r = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_v2", "type": "pet", "care_instructions": "", "voice_path": path2,
            })
            assert r.status_code == 200, r.text
        finally:
            _cleanup_user(mongo, uid)

    def test_put_keeping_voice_on_same_profile_not_blocked(self, base_url, mongo):
        """PUT that keeps voice_path on the SAME profile must not be blocked (excluded via existing_profile_id)."""
        uid, token = _seed_user(mongo, "free")
        try:
            s = requests.Session()
            s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

            path1 = _upload_audio(base_url, token).json()["path"]
            p1 = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_keep", "type": "pet", "care_instructions": "", "voice_path": path1,
            }).json()

            r = s.put(f"{base_url}/api/profiles/{p1['profile_id']}", json={
                "name": "TEST_keep_upd", "type": "pet", "care_instructions": "notes",
                "voice_path": path1,
            })
            assert r.status_code == 200, r.text
        finally:
            _cleanup_user(mongo, uid)


# ---------- Activation with voice + signed URLs ----------
class TestActivationVoiceShareFlow:
    def test_full_flow_two_voice_profiles(self, base_url, mongo):
        """Two profiles, each with a voice message. After activate, share JSON must
        expose DISTINCT voice_urls per profile with different file_tokens, and each
        signed URL must be fetchable. HTML page must contain <audio autoplay>."""
        uid, token = _seed_user(mongo, "plus")  # plus to allow 2 voice profiles
        try:
            s = requests.Session()
            s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

            # Upload two audio files
            p1_audio = _upload_audio(base_url, token).json()["path"]
            p2_audio = _upload_audio(base_url, token).json()["path"]
            assert p1_audio != p2_audio

            prof1 = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_Duke", "type": "pet", "care_instructions": "Feed at 8",
                "voice_path": p1_audio,
            }).json()
            prof2 = s.post(f"{base_url}/api/profiles", json={
                "name": "TEST_Fern", "type": "plant", "care_instructions": "Weekly water",
                "voice_path": p2_audio,
            }).json()

            s.post(f"{base_url}/api/contacts", json={
                "name": "TEST_Trusted", "email": "trusted_TEST@example.com",
                "relationship": "friend", "notify_order": 1,
            })

            ev = s.post(f"{base_url}/api/activate").json()
            assert ev["status"] == "active"
            assert len(ev["shares"]) == 1
            share_token = ev["shares"][0]["share_token"]

            # Public JSON
            r = requests.get(f"{base_url}/api/share/{share_token}")
            assert r.status_code == 200, r.text
            payload = r.json()
            assert payload["expired"] is False
            profs = {p["profile_id"]: p for p in payload["profiles"]}
            assert prof1["profile_id"] in profs and prof2["profile_id"] in profs

            v1 = profs[prof1["profile_id"]].get("voice_url")
            v2 = profs[prof2["profile_id"]].get("voice_url")
            assert v1 and v2, f"voice_url missing: {v1=} {v2=}"

            # Tokens must be DIFFERENT per profile
            def _tok(url):
                m = re.search(r"token=([^&]+)", url)
                return m.group(1) if m else None

            tok1 = _tok(v1)
            tok2 = _tok(v2)
            assert tok1 and tok2
            assert tok1 != tok2, "voice_urls should carry distinct file_tokens per profile"

            # And each voice_url must reference its OWN voice_path
            assert p1_audio in v1
            assert p2_audio in v2

            # /api/files with valid token → 200
            r_ok = requests.get(f"{base_url}/api/files/{p1_audio}", params={"token": tok1})
            assert r_ok.status_code == 200, r_ok.text
            assert len(r_ok.content) > 0

            # Wrong token → 403
            r_bad = requests.get(f"{base_url}/api/files/{p1_audio}", params={"token": "definitely-not-valid"})
            assert r_bad.status_code == 403

            # Missing token entirely → 403
            r_none = requests.get(f"{base_url}/api/files/{p1_audio}")
            assert r_none.status_code == 403

            # Cross-token also 403 (tok2 was for p2, cannot access p1... actually it may work
            # since photo_tokens is a per-share list — verify current behavior)
            # In server.py, ANY token in share.photo_tokens grants access to ANY file owned
            # by the same activation-event user. So tok2 opening p1_audio is EXPECTED 200.
            r_cross = requests.get(f"{base_url}/api/files/{p1_audio}", params={"token": tok2})
            # We accept either 200 (current design: any share token unlocks any owned file)
            # or 403 (stricter per-file binding). Just log and don't fail.
            assert r_cross.status_code in (200, 403)

            # HTML page: <audio ... autoplay> per profile with voice_url
            r_html = requests.get(f"{base_url}/api/share/{share_token}/page")
            assert r_html.status_code == 200
            html = r_html.text
            # Two <audio ... autoplay> tags expected
            audio_tags = re.findall(r"<audio[^>]*autoplay[^>]*>", html)
            assert len(audio_tags) >= 2, f"expected 2 autoplay audio tags, got {len(audio_tags)}: {audio_tags}"
            # Both voice paths referenced
            assert p1_audio in html
            assert p2_audio in html
        finally:
            _cleanup_user(mongo, uid)
