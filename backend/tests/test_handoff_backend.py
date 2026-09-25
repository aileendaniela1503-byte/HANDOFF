"""End-to-end backend tests for Handoff app.

Covers:
- email/password auth + auth/me
- profiles CRUD
- contacts CRUD
- activation → share JSON → resolve → expired
- public /share/{token} HTML page
- subscription upgrade
- account delete cascade
"""
import os
import uuid
import requests
import pytest


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


# ---------- Auth ----------
class TestAuth:
    def test_me_without_token_401(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_bad_token_401(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me", headers={"Authorization": "Bearer nope-nope-nope"})
        assert r.status_code == 401

    def test_me_with_seeded_session(self, base_url, auth_session, seeded_user):
        r = auth_session.get(f"{base_url}/api/auth/me")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == seeded_user["user_id"]
        assert data["email"] == seeded_user["email"]
        assert data["subscription_tier"] == "free"


# ---------- Profiles CRUD ----------
class TestProfiles:
    def test_profile_crud(self, base_url, auth_session):
        payload = {"name": "TEST_Buddy", "type": "pet", "care_instructions": "Feed twice/day"}
        r = auth_session.post(f"{base_url}/api/profiles", json=payload)
        assert r.status_code == 200, r.text
        profile = r.json()
        assert profile["name"] == "TEST_Buddy"
        assert profile["type"] == "pet"
        pid = profile["profile_id"]

        r = auth_session.get(f"{base_url}/api/profiles")
        assert r.status_code == 200
        assert pid in [p["profile_id"] for p in r.json()]

        upd = {"name": "TEST_BuddyUpdated", "type": "pet", "care_instructions": "Feed once"}
        r = auth_session.put(f"{base_url}/api/profiles/{pid}", json=upd)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_BuddyUpdated"
        assert r.json()["care_instructions"] == "Feed once"

        r = auth_session.delete(f"{base_url}/api/profiles/{pid}")
        assert r.status_code == 200
        r = auth_session.delete(f"{base_url}/api/profiles/{pid}")
        assert r.status_code == 404


# ---------- Contacts CRUD ----------
class TestContacts:
    def test_contact_crud(self, base_url, auth_session):
        payload = {"name": "TEST_Alice", "email": "alice_TEST@example.com", "relationship": "sister", "notify_order": 1}
        r = auth_session.post(f"{base_url}/api/contacts", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["contact_id"]

        r = auth_session.get(f"{base_url}/api/contacts")
        assert r.status_code == 200
        assert any(c["contact_id"] == cid for c in r.json())

        upd = {"name": "TEST_AliceUpd", "email": "alice_TEST@example.com", "relationship": "sister", "notify_order": 2}
        r = auth_session.put(f"{base_url}/api/contacts/{cid}", json=upd)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_AliceUpd"
        assert r.json()["notify_order"] == 2

        r = auth_session.delete(f"{base_url}/api/contacts/{cid}")
        assert r.status_code == 200

    def test_contact_requires_email_or_phone(self, base_url, auth_session):
        r = auth_session.post(f"{base_url}/api/contacts", json={"name": "TEST_NoContact"})
        assert r.status_code == 400


# ---------- Activation + Share + Resolve ----------
class TestActivationFlow:
    @pytest.fixture(scope="class")
    def activation(self, base_url, auth_session):
        prof = auth_session.post(f"{base_url}/api/profiles", json={
            "name": "TEST_Cactus", "type": "plant", "care_instructions": "Water weekly"
        }).json()
        contact = auth_session.post(f"{base_url}/api/contacts", json={
            "name": "TEST_Bob", "email": "bob_TEST@example.com", "relationship": "friend", "notify_order": 1
        }).json()

        r = auth_session.post(f"{base_url}/api/activate")
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["status"] == "active"
        assert len(ev["shares"]) == 1
        share = ev["shares"][0]
        assert share["contact_id"] == contact["contact_id"]
        assert share["delivery_status"] in ("sent", "failed", "pending", "skipped_no_email")
        return {"event_id": ev["event_id"], "share_token": share["share_token"], "profile_id": prof["profile_id"], "contact_id": contact["contact_id"]}

    def test_get_share_json_active(self, base_url, activation):
        r = requests.get(f"{base_url}/api/share/{activation['share_token']}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("expired") is False
        assert data.get("owner_name")
        assert data.get("contact_name") == "TEST_Bob"
        assert isinstance(data.get("profiles"), list) and len(data["profiles"]) >= 1
        assert isinstance(data.get("contacts"), list)

    def test_public_share_html_active(self, base_url, activation):
        r = requests.get(f"{base_url}/share/{activation['share_token']}")
        assert r.status_code == 200

    def test_resolve_event(self, base_url, auth_session, activation):
        r = auth_session.post(f"{base_url}/api/events/{activation['event_id']}/resolve")
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"

    def test_share_json_expired_after_resolve(self, base_url, activation):
        r = requests.get(f"{base_url}/api/share/{activation['share_token']}")
        assert r.status_code == 200
        assert r.json().get("expired") is True

    def test_public_share_html_expired(self, base_url, activation):
        r = requests.get(f"{base_url}/share/{activation['share_token']}")
        assert r.status_code == 200

    def test_share_not_found(self, base_url):
        r = requests.get(f"{base_url}/api/share/does_not_exist_TEST")
        assert r.status_code == 404
        r = requests.get(f"{base_url}/share/does_not_exist_TEST")
        assert r.status_code == 200


# ---------- Subscription ----------
class TestSubscription:
    def test_upgrade_updates_tier(self, base_url, auth_session):
        r = requests.post(
            f"{base_url}/api/subscription/upgrade",
            data={"tier": "plus"},
            headers={"Authorization": auth_session.headers["Authorization"]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["subscription_tier"] == "plus"
        assert auth_session.get(f"{base_url}/api/auth/me").json()["subscription_tier"] == "plus"

    def test_upgrade_invalid_tier(self, base_url, auth_session):
        r = requests.post(
            f"{base_url}/api/subscription/upgrade",
            data={"tier": "gold"},
            headers={"Authorization": auth_session.headers["Authorization"]},
        )
        assert r.status_code == 400


# ---------- Account cascade delete ----------
class TestAccountDelete:
    def test_delete_account_cascades(self, base_url, mongo):
        uid = f"user_TEST_{uuid.uuid4().hex[:8]}"
        token = f"TEST_tok_{uuid.uuid4().hex}"
        mongo.users.insert_one({
            "user_id": uid, "email": f"TEST_{uuid.uuid4().hex[:6]}@example.com",
            "name": "TEST Cascade", "picture": None, "subscription_tier": "free",
            "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        })
        mongo.user_sessions.insert_one({
            "session_token": token, "user_id": uid,
            "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
            "expires_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc) + __import__("datetime").timedelta(days=7),
        })
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        s.post(f"{base_url}/api/profiles", json={"name": "TEST_p", "type": "pet", "care_instructions": ""})
        s.post(f"{base_url}/api/contacts", json={"name": "TEST_c", "email": "c_TEST@example.com"})
        s.post(f"{base_url}/api/activate")

        r = s.delete(f"{base_url}/api/account")
        assert r.status_code == 200
        assert mongo.users.find_one({"user_id": uid}) is None
        assert mongo.profiles.count_documents({"user_id": uid}) == 0
        assert mongo.contacts.count_documents({"user_id": uid}) == 0
        assert mongo.activation_events.count_documents({"user_id": uid}) == 0
        assert mongo.user_sessions.count_documents({"user_id": uid}) == 0
        assert s.get(f"{base_url}/api/auth/me").status_code == 401
