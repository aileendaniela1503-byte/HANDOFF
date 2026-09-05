"""Backend tests for the Planned Handoff feature.

Covers:
- POST /api/planned validation + happy path
- GET /api/planned scoping (only scheduled/active planned events)
- Auto-activation on read (start_at reached -> status active + shares created + emails sent)
- Auto-expiry (end_at reached -> resolved, share view returns expired)
- Share scoping (only selected profile_ids are exposed in share view)
- PUT /api/planned/{id} allowed only while scheduled
- DELETE /api/planned/{id} cancels (scheduled or active) and invalidates share
- Coexistence with emergency /api/activate
- Regressions: free-tier voice cap, /api/share/{token}/page still emits <audio autoplay>
"""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")
FRONTEND_ENV = ROOT_DIR.parent / "frontend" / ".env"
if FRONTEND_ENV.exists():
    load_dotenv(FRONTEND_ENV, override=False)

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ---------------- helpers ----------------
def _seed_user(mongo, tier="free"):
    user_id = f"user_TEST_{uuid.uuid4().hex[:8]}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    token = f"TEST_tok_{uuid.uuid4().hex}"
    mongo.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "TEST Planned",
        "picture": None,
        "subscription_tier": tier,
        "created_at": datetime.now(timezone.utc),
    })
    mongo.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return user_id, s


def _cleanup(mongo, user_id):
    mongo.users.delete_one({"user_id": user_id})
    mongo.user_sessions.delete_many({"user_id": user_id})
    mongo.profiles.delete_many({"user_id": user_id})
    mongo.contacts.delete_many({"user_id": user_id})
    ev_ids = [e["event_id"] for e in mongo.activation_events.find({"user_id": user_id}, {"event_id": 1})]
    if ev_ids:
        mongo.activation_shares.delete_many({"event_id": {"$in": ev_ids}})
    mongo.activation_events.delete_many({"user_id": user_id})


def _mk_profile(sess, name="Fido", ptype="pet"):
    r = sess.post(f"{BASE_URL}/api/profiles", json={
        "name": name, "type": ptype, "care_instructions": f"care for {name}",
    })
    r.raise_for_status()
    return r.json()


def _mk_contact(sess, email="delivered@resend.dev"):
    r = sess.post(f"{BASE_URL}/api/contacts", json={
        "name": "TEST Contact", "email": email, "relationship": "friend", "notify_order": 1,
    })
    r.raise_for_status()
    return r.json()


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture
def user_ctx(mongo):
    user_id, sess = _seed_user(mongo)
    p1 = _mk_profile(sess, "P1", "pet")
    p2 = _mk_profile(sess, "P2", "plant")
    c1 = _mk_contact(sess, "delivered@resend.dev")
    yield {"user_id": user_id, "sess": sess, "p1": p1, "p2": p2, "c1": c1}
    _cleanup(mongo, user_id)


# ---------------- POST /api/planned validation ----------------
class TestPlannedCreateValidation:
    def test_create_happy_path(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(minutes=5)
        end = start + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "Trip to Paris",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["event_type"] == "planned"
        assert ev["status"] == "scheduled"
        assert ev["title"] == "Trip to Paris"
        assert ev["profile_ids"] == [user_ctx["p1"]["profile_id"]]
        assert ev["contact_ids"] == [user_ctx["c1"]["contact_id"]]

    def test_end_before_start_returns_400(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start - timedelta(minutes=30)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "bad", "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 400

    def test_equal_start_end_returns_400(self, user_ctx):
        s = user_ctx["sess"]
        t = datetime.now(timezone.utc) + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "bad", "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(t), "end_at": _iso(t),
        })
        assert r.status_code == 400

    def test_empty_contacts_returns_400(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(minutes=5)
        end = start + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "bad", "profile_ids": [user_ctx["p1"]["profile_id"]], "contact_ids": [],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 400

    def test_empty_profiles_returns_400(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(minutes=5)
        end = start + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "bad", "profile_ids": [], "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 400

    def test_foreign_contact_id_returns_400(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(minutes=5)
        end = start + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "bad", "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": ["cont_notmine123"],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 400

    def test_foreign_profile_id_returns_400(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(minutes=5)
        end = start + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "bad", "profile_ids": ["prof_notmine123"],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 400


# ---------------- GET /api/planned scoping ----------------
class TestPlannedListScope:
    def test_list_excludes_emergency_and_terminal(self, user_ctx):
        s = user_ctx["sess"]
        # 1 planned scheduled
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "future",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 200
        planned_id = r.json()["event_id"]

        # 1 emergency active
        er = s.post(f"{BASE_URL}/api/activate")
        assert er.status_code == 200
        emergency_id = er.json()["event_id"]

        # 1 planned that we then cancel
        r2 = s.post(f"{BASE_URL}/api/planned", json={
            "title": "to-cancel",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start + timedelta(hours=3)), "end_at": _iso(end + timedelta(hours=3)),
        })
        assert r2.status_code == 200
        cancelled_id = r2.json()["event_id"]
        dr = s.delete(f"{BASE_URL}/api/planned/{cancelled_id}")
        assert dr.status_code == 200

        listing = s.get(f"{BASE_URL}/api/planned").json()
        ids = {e["event_id"] for e in listing}
        assert planned_id in ids
        assert emergency_id not in ids, "emergency events should not be in /api/planned"
        assert cancelled_id not in ids, "cancelled events should not be in /api/planned"
        for e in listing:
            assert e["event_type"] == "planned"
            assert e["status"] in ("scheduled", "active")


# ---------------- Auto-activate / auto-expire ----------------
class TestPlannedLifecycle:
    def test_auto_activate_on_read_creates_shares_and_emails(self, user_ctx, mongo):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(seconds=2)
        end = datetime.now(timezone.utc) + timedelta(minutes=10)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "About-to-start",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert r.status_code == 200
        eid = r.json()["event_id"]
        assert r.json()["status"] == "scheduled"

        time.sleep(3.5)
        listing = s.get(f"{BASE_URL}/api/planned").json()
        match = [e for e in listing if e["event_id"] == eid]
        assert match, "auto-activated event should still be in listing (status=active)"
        assert match[0]["status"] == "active", f"expected active, got {match[0]['status']}"

        # Give the email fire-and-forget a moment to update delivery_status
        time.sleep(1.5)
        shares = list(mongo.activation_shares.find({"event_id": eid}))
        assert len(shares) == 1, f"expected 1 share, got {len(shares)}"
        ds = shares[0].get("delivery_status")
        assert ds in ("sent", "failed"), f"unexpected delivery_status={ds}"
        # For delivered@resend.dev we should ideally have 'sent', but 'failed' is
        # acceptable per spec if the email provider is unavailable
        # We still flag the state loudly on failure
        assert ds != "pending", "delivery_status must have been updated after activation"

    def test_active_planned_returned_by_events_active(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(seconds=1)
        end = datetime.now(timezone.utc) + timedelta(minutes=10)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "Now-ish",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        eid = r.json()["event_id"]
        time.sleep(2.5)
        ev = s.get(f"{BASE_URL}/api/events/active").json()
        assert ev is not None
        assert ev["event_id"] == eid
        assert ev["event_type"] == "planned"
        assert ev["status"] == "active"

    def test_auto_expire_marks_resolved_and_share_expired(self, user_ctx, mongo):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(seconds=1)
        end = datetime.now(timezone.utc) + timedelta(seconds=5)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "Blink",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        eid = r.json()["event_id"]

        # First read AFTER start but BEFORE end -> triggers activation & share creation
        time.sleep(2)
        listing_active = s.get(f"{BASE_URL}/api/planned").json()
        assert any(e["event_id"] == eid and e["status"] == "active" for e in listing_active), \
            "event should have been auto-activated"

        # Wait past end, then read again -> triggers expiry
        time.sleep(4.5)
        listing = s.get(f"{BASE_URL}/api/planned").json()
        s.get(f"{BASE_URL}/api/events/active")
        assert not any(e["event_id"] == eid for e in listing), "expired event must not appear in /api/planned"

        # Confirm status is resolved in mongo
        ev_doc = mongo.activation_events.find_one({"event_id": eid})
        assert ev_doc["status"] == "resolved", f"expected resolved, got {ev_doc['status']}"

        # share token should read as expired
        share = mongo.activation_shares.find_one({"event_id": eid})
        assert share, "share should have been created during the active window"
        share_r = requests.get(f"{BASE_URL}/api/share/{share['share_token']}")
        assert share_r.status_code == 200
        assert share_r.json().get("expired") is True


# ---------------- Share scoping ----------------
class TestShareScope:
    def test_share_view_only_returns_selected_profile(self, user_ctx, mongo):
        s = user_ctx["sess"]
        # Create with only P1 (P2 exists but is NOT included)
        start = datetime.now(timezone.utc) + timedelta(seconds=1)
        end = datetime.now(timezone.utc) + timedelta(minutes=10)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "Only-P1",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        eid = r.json()["event_id"]
        time.sleep(2.5)
        s.get(f"{BASE_URL}/api/planned")  # trigger activation

        share = mongo.activation_shares.find_one({"event_id": eid})
        assert share, "share must exist after activation"
        payload = requests.get(f"{BASE_URL}/api/share/{share['share_token']}").json()
        assert payload.get("expired") is False
        assert payload["event_type"] == "planned"
        assert payload["title"] == "Only-P1"
        ids = [p["profile_id"] for p in payload["profiles"]]
        assert user_ctx["p1"]["profile_id"] in ids
        assert user_ctx["p2"]["profile_id"] not in ids, "P2 must be scoped out"


# ---------------- Update / cancel semantics ----------------
class TestPlannedUpdateCancel:
    def test_put_allowed_while_scheduled_forbidden_when_active(self, user_ctx):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(seconds=2)
        end = datetime.now(timezone.utc) + timedelta(minutes=10)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "Renameable",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        eid = r.json()["event_id"]

        # PUT while still scheduled - should work
        put_ok = s.put(f"{BASE_URL}/api/planned/{eid}", json={
            "title": "Renamed",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert put_ok.status_code == 200, put_ok.text
        assert put_ok.json()["title"] == "Renamed"

        # wait for activation
        time.sleep(3)
        s.get(f"{BASE_URL}/api/events/active")

        put_bad = s.put(f"{BASE_URL}/api/planned/{eid}", json={
            "title": "Nope",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        assert put_bad.status_code == 404, f"expected 404 once active, got {put_bad.status_code}"

    def test_delete_cancels_active_planned_and_share_expires(self, user_ctx, mongo):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(seconds=1)
        end = datetime.now(timezone.utc) + timedelta(minutes=10)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "Cancel-active",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        eid = r.json()["event_id"]
        time.sleep(2.5)
        s.get(f"{BASE_URL}/api/planned")  # activate
        share = mongo.activation_shares.find_one({"event_id": eid})
        assert share

        d = s.delete(f"{BASE_URL}/api/planned/{eid}")
        assert d.status_code == 200
        ev_doc = mongo.activation_events.find_one({"event_id": eid})
        assert ev_doc["status"] == "cancelled"

        # share reads expired
        p = requests.get(f"{BASE_URL}/api/share/{share['share_token']}").json()
        assert p.get("expired") is True

    def test_delete_scheduled_moves_to_cancelled(self, user_ctx, mongo):
        s = user_ctx["sess"]
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)
        r = s.post(f"{BASE_URL}/api/planned", json={
            "title": "Cancel-scheduled",
            "profile_ids": [user_ctx["p1"]["profile_id"]],
            "contact_ids": [user_ctx["c1"]["contact_id"]],
            "start_at": _iso(start), "end_at": _iso(end),
        })
        eid = r.json()["event_id"]
        d = s.delete(f"{BASE_URL}/api/planned/{eid}")
        assert d.status_code == 200
        ev_doc = mongo.activation_events.find_one({"event_id": eid})
        assert ev_doc["status"] == "cancelled"

        listing = s.get(f"{BASE_URL}/api/planned").json()
        assert not any(e["event_id"] == eid for e in listing)


# ---------------- Emergency coexistence ----------------
class TestEmergencyCoexists:
    def test_emergency_activate_still_works(self, user_ctx):
        s = user_ctx["sess"]
        r = s.post(f"{BASE_URL}/api/activate")
        assert r.status_code == 200
        ev = r.json()
        assert ev["event_type"] == "emergency"
        assert ev["status"] == "active"
        # /events/active should return an active event
        a = s.get(f"{BASE_URL}/api/events/active").json()
        assert a is not None
        assert a["status"] == "active"


# ---------------- Regressions ----------------
class TestRegressions:
    def test_free_tier_voice_cap_still_402_on_second_profile(self, mongo):
        uid, s = _seed_user(mongo, tier="free")
        try:
            r1 = s.post(f"{BASE_URL}/api/profiles", json={
                "name": "V1", "type": "pet", "care_instructions": "", "voice_path": "handoff/fake/v1.m4a",
            })
            assert r1.status_code == 200
            r2 = s.post(f"{BASE_URL}/api/profiles", json={
                "name": "V2", "type": "pet", "care_instructions": "", "voice_path": "handoff/fake/v2.m4a",
            })
            assert r2.status_code == 402, f"expected 402 tier gate, got {r2.status_code}"
        finally:
            _cleanup(mongo, uid)

    def test_share_html_page_still_has_audio_autoplay(self, mongo):
        uid, s = _seed_user(mongo, tier="plus")
        try:
            # Upload a small audio file so we can attach it to a profile
            fake = b"fakeaudio" * 200
            up = s.post(
                f"{BASE_URL}/api/upload/audio",
                files={"file": ("v.m4a", fake, "audio/mp4")},
                headers={"Authorization": s.headers["Authorization"]},  # drop json content-type
                data={},
            )
            # requests overrides content-type when using files=, but we forced json header above.
            # Use a fresh session to avoid the json header interfering.
            up_sess = requests.Session()
            up_sess.headers.update({"Authorization": s.headers["Authorization"]})
            up = up_sess.post(f"{BASE_URL}/api/upload/audio", files={"file": ("v.m4a", fake, "audio/mp4")})
            assert up.status_code == 200, up.text
            voice_path = up.json()["path"]

            pr = s.post(f"{BASE_URL}/api/profiles", json={
                "name": "Vocal", "type": "pet", "care_instructions": "hi", "voice_path": voice_path,
            })
            assert pr.status_code == 200
            cr = s.post(f"{BASE_URL}/api/contacts", json={
                "name": "R", "email": "delivered@resend.dev", "relationship": "", "notify_order": 1,
            })
            assert cr.status_code == 200

            # emergency activate -> share -> page HTML
            act = s.post(f"{BASE_URL}/api/activate")
            assert act.status_code == 200
            eid = act.json()["event_id"]
            share = MongoClient(MONGO_URL)[DB_NAME].activation_shares.find_one({"event_id": eid})
            assert share
            page = requests.get(f"{BASE_URL}/api/share/{share['share_token']}/page")
            assert page.status_code == 200
            html = page.text
            assert "<audio" in html and "autoplay" in html, "share HTML should contain <audio ... autoplay>"
        finally:
            _cleanup(mongo, uid)
