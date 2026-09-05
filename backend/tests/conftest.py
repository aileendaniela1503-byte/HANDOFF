import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

# Prefer public preview URL from frontend/.env for realistic testing
FRONTEND_ENV = ROOT_DIR.parent / "frontend" / ".env"
if FRONTEND_ENV.exists():
    load_dotenv(FRONTEND_ENV, override=False)

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="session")
def base_url():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
    return BASE_URL


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session")
def seeded_user(mongo):
    """Create a TEST_ user + session directly in Mongo so we can auth."""
    user_id = f"user_TEST_{uuid.uuid4().hex[:8]}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    session_token = f"TEST_tok_{uuid.uuid4().hex}"

    mongo.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "TEST User",
        "picture": None,
        "subscription_tier": "free",
        "created_at": datetime.now(timezone.utc),
    })
    mongo.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })

    yield {"user_id": user_id, "email": email, "token": session_token, "name": "TEST User"}

    # Cleanup
    mongo.users.delete_one({"user_id": user_id})
    mongo.user_sessions.delete_many({"user_id": user_id})
    mongo.profiles.delete_many({"user_id": user_id})
    mongo.contacts.delete_many({"user_id": user_id})
    ev_ids = [e["event_id"] for e in mongo.activation_events.find({"user_id": user_id}, {"event_id": 1})]
    if ev_ids:
        mongo.activation_shares.delete_many({"event_id": {"$in": ev_ids}})
    mongo.activation_events.delete_many({"user_id": user_id})


@pytest.fixture(scope="session")
def auth_session(seeded_user, base_url):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {seeded_user['token']}",
        "Content-Type": "application/json",
    })
    return s
