import os
import re
import uuid
import ipaddress
import logging
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Literal
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Form, Depends
from fastapi.responses import Response, HTMLResponse
from fastapi.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("handoff")

# ---------- MongoDB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------- Object Storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "handoff"
storage_key: Optional[str] = None


def _init_storage_sync():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def _put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    key = _init_storage_sync()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        storage_key = None
        key = _init_storage_sync()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _get_object_sync(path: str):
    global storage_key
    key = _init_storage_sync()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        storage_key = None
        key = _init_storage_sync()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- Email ----------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Handoff")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return None


# ---------- Models ----------
ProfileType = Literal["pet", "dependent", "medication", "plant", "home", "other"]


class SessionBody(BaseModel):
    session_id: str


class User(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    subscription_tier: str = "free"
    created_at: datetime


class ProfileIn(BaseModel):
    name: str
    type: ProfileType
    care_instructions: str = ""
    photo_path: Optional[str] = None


class Profile(ProfileIn):
    profile_id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


class ContactIn(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    relationship: str = ""
    notify_order: int = 1


class Contact(ContactIn):
    contact_id: str
    user_id: str
    created_at: datetime


class ActivationEvent(BaseModel):
    event_id: str
    user_id: str
    triggered_by: str = "self"
    triggered_at: datetime
    status: str = "active"
    resolved_at: Optional[datetime] = None
    shares: List[dict] = []


# ---------- App ----------
app = FastAPI()
api = APIRouter(prefix="/api")


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.profiles.create_index([("user_id", 1)])
    await db.contacts.create_index([("user_id", 1)])
    await db.activation_shares.create_index("share_token", unique=True)
    try:
        await run_in_threadpool(_init_storage_sync)
    except Exception as e:
        logger.warning(f"Storage init failed (will retry lazily): {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------- Auth ----------
async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = session["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


_SEEN_SESSION_IDS: set = set()


@api.post("/auth/session")
async def create_session(body: SessionBody):
    sid = body.session_id
    if sid in _SEEN_SESSION_IDS:
        raise HTTPException(status_code=401, detail="Session already used")
    _SEEN_SESSION_IDS.add(sid)
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": sid},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session id")
        data = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session exchange failed: {e}")
        raise HTTPException(status_code=401, detail="Auth failed")

    email = data.get("email")
    name = data.get("name") or email
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Bad session data")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "subscription_tier": "free",
            "created_at": datetime.now(timezone.utc),
        })

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user}


@api.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Profiles ----------
@api.get("/profiles")
async def list_profiles(user=Depends(get_current_user)):
    docs = await db.profiles.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return docs


@api.post("/profiles")
async def create_profile(body: ProfileIn, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    doc = {
        "profile_id": f"prof_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "name": body.name,
        "type": body.type,
        "care_instructions": body.care_instructions,
        "photo_path": body.photo_path,
        "created_at": now,
        "updated_at": now,
    }
    await db.profiles.insert_one(dict(doc))
    return doc


@api.put("/profiles/{profile_id}")
async def update_profile(profile_id: str, body: ProfileIn, user=Depends(get_current_user)):
    result = await db.profiles.update_one(
        {"profile_id": profile_id, "user_id": user["user_id"]},
        {"$set": {
            "name": body.name,
            "type": body.type,
            "care_instructions": body.care_instructions,
            "photo_path": body.photo_path,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    doc = await db.profiles.find_one({"profile_id": profile_id}, {"_id": 0})
    return doc


@api.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, user=Depends(get_current_user)):
    result = await db.profiles.delete_one({"profile_id": profile_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"ok": True}


# ---------- Contacts ----------
@api.get("/contacts")
async def list_contacts(user=Depends(get_current_user)):
    docs = await db.contacts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("notify_order", 1).to_list(50)
    return docs


@api.post("/contacts")
async def create_contact(body: ContactIn, user=Depends(get_current_user)):
    if not body.email and not body.phone:
        raise HTTPException(status_code=400, detail="Provide email or phone")
    doc = {
        "contact_id": f"cont_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "name": body.name,
        "email": body.email,
        "phone": body.phone,
        "relationship": body.relationship,
        "notify_order": body.notify_order,
        "created_at": datetime.now(timezone.utc),
    }
    await db.contacts.insert_one(dict(doc))
    return doc


@api.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, body: ContactIn, user=Depends(get_current_user)):
    result = await db.contacts.update_one(
        {"contact_id": contact_id, "user_id": user["user_id"]},
        {"$set": {
            "name": body.name,
            "email": body.email,
            "phone": body.phone,
            "relationship": body.relationship,
            "notify_order": body.notify_order,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    doc = await db.contacts.find_one({"contact_id": contact_id}, {"_id": 0})
    return doc


@api.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user=Depends(get_current_user)):
    result = await db.contacts.delete_one({"contact_id": contact_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"ok": True}


# ---------- Photo upload ----------
@api.post("/upload")
async def upload_photo(file: UploadFile = File(...), user=Depends(get_current_user)):
    ext = (file.filename or "img").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    content_type = file.content_type or "image/jpeg"
    result = await run_in_threadpool(_put_object_sync, path, data, content_type)
    await db.uploads.insert_one({
        "path": result["path"],
        "owner_id": user["user_id"],
        "size": result.get("size"),
        "created_at": datetime.now(timezone.utc),
    })
    return {"path": result["path"]}


def _issue_photo_token(path: str) -> str:
    return secrets.token_urlsafe(24)


@api.get("/files/{path:path}")
async def get_file(path: str, token: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    # Allow access via either bearer session (owner) or a short-lived photo token
    rec = await db.uploads.find_one({"path": path}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")

    allowed = False
    if authorization and authorization.lower().startswith("bearer "):
        tok = authorization.split(" ", 1)[1].strip()
        s = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
        if s and s["user_id"] == rec["owner_id"]:
            allowed = True
    if not allowed and token:
        share = await db.activation_shares.find_one({"photo_tokens": token}, {"_id": 0})
        if share:
            event = await db.activation_events.find_one({"event_id": share["event_id"]}, {"_id": 0})
            if event and event.get("status") == "active" and rec["owner_id"] == event["user_id"]:
                allowed = True
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    content, ct = await run_in_threadpool(_get_object_sync, path)
    return Response(content=content, media_type=ct)


# ---------- Activation ----------
def _public_share_url(share_token: str) -> str:
    """URL sent in emails — points at the backend HTML page so it works
    without JS. The Expo app also has a native /share/{token} deep link,
    but that one requires the SPA to boot."""
    base = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://trusted-backup.preview.emergentagent.com"
    return f"{base.rstrip('/')}/api/share/{share_token}/page"


def _app_share_deep_link(share_token: str) -> str:
    base = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://trusted-backup.preview.emergentagent.com"
    return f"{base.rstrip('/')}/share/{share_token}"


@api.post("/activate")
async def activate(user=Depends(get_current_user)):
    contacts = await db.contacts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(20)
    profiles = await db.profiles.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(200)
    event_id = f"evt_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    shares = []
    photo_tokens = []
    for p in profiles:
        if p.get("photo_path"):
            photo_tokens.append(secrets.token_urlsafe(16))

    for c in contacts:
        share_token = secrets.token_urlsafe(24)
        share_doc = {
            "share_token": share_token,
            "event_id": event_id,
            "user_id": user["user_id"],
            "contact_id": c["contact_id"],
            "contact_name": c["name"],
            "contact_email": c.get("email"),
            "delivery_status": "pending",
            "delivered_at": None,
            "viewed_at": None,
            "photo_tokens": photo_tokens,
            "created_at": now,
        }
        await db.activation_shares.insert_one(dict(share_doc))
        shares.append({
            "share_token": share_token,
            "contact_id": c["contact_id"],
            "contact_name": c["name"],
            "contact_email": c.get("email"),
            "delivery_status": "pending",
        })

    event = {
        "event_id": event_id,
        "user_id": user["user_id"],
        "triggered_by": "self",
        "triggered_at": now,
        "status": "active",
        "resolved_at": None,
        "shares": shares,
    }
    await db.activation_events.insert_one(dict(event))

    # Send emails asynchronously
    for s in shares:
        if not s.get("contact_email"):
            await db.activation_shares.update_one(
                {"share_token": s["share_token"]},
                {"$set": {"delivery_status": "skipped_no_email"}},
            )
            continue
        try:
            link = _public_share_url(s["share_token"])
            subject = f"{user.get('name', 'A Handoff user')} has activated their Handoff plan"
            first_name = escape((user.get("name") or "your contact").split(" ")[0])
            html = (
                f'<table role="presentation" width="100%" style="font-family:Arial,sans-serif">'
                f'<tr><td style="padding:24px">'
                f'<h2 style="color:#26303B;margin:0 0 8px">Handoff — Action Needed</h2>'
                f'<p>Hi {escape(s["contact_name"])},</p>'
                f'<p><strong>{escape(user.get("name") or "A Handoff user")}</strong> has activated their '
                f'Handoff plan and named you as a trusted contact. Please open the secure page below to '
                f'view exactly what they need help with right now.</p>'
                f'<p style="margin:24px 0"><a href="{link}" '
                f'style="background:#2C63A0;color:#ffffff;padding:14px 22px;text-decoration:none;'
                f'border-radius:12px;font-weight:600">View Handoff Page</a></p>'
                f'<p style="color:#69747F;font-size:13px">This link is private. It expires once '
                f'{first_name} marks the situation resolved.</p>'
                f'<p style="color:#69747F;font-size:12px;margin-top:32px">Sent by {escape(EMAIL_FROM_NAME)}. '
                f'We never ask for your password or card details by email.</p>'
                f'</td></tr></table>'
            )
            email_id = await send_email(to=s["contact_email"], subject=subject, html=html)
            status = "sent" if email_id else "failed"
            await db.activation_shares.update_one(
                {"share_token": s["share_token"]},
                {"$set": {"delivery_status": status, "delivered_at": datetime.now(timezone.utc) if email_id else None}},
            )
        except Exception as e:
            logger.error(f"Send fail for share {s['share_token']}: {e}")
            await db.activation_shares.update_one(
                {"share_token": s["share_token"]},
                {"$set": {"delivery_status": "failed"}},
            )

    ev = await db.activation_events.find_one({"event_id": event_id}, {"_id": 0})
    ev["shares"] = await db.activation_shares.find({"event_id": event_id}, {"_id": 0, "photo_tokens": 0}).to_list(50)
    return ev


@api.get("/events/active")
async def get_active_event(user=Depends(get_current_user)):
    ev = await db.activation_events.find_one(
        {"user_id": user["user_id"], "status": "active"}, {"_id": 0}, sort=[("triggered_at", -1)]
    )
    if not ev:
        return None
    ev["shares"] = await db.activation_shares.find({"event_id": ev["event_id"]}, {"_id": 0, "photo_tokens": 0}).to_list(50)
    return ev


@api.post("/events/{event_id}/resolve")
async def resolve_event(event_id: str, user=Depends(get_current_user)):
    result = await db.activation_events.update_one(
        {"event_id": event_id, "user_id": user["user_id"], "status": "active"},
        {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found or already resolved")
    ev = await db.activation_events.find_one({"event_id": event_id}, {"_id": 0})
    ev["shares"] = await db.activation_shares.find({"event_id": event_id}, {"_id": 0, "photo_tokens": 0}).to_list(50)
    return ev


# ---------- Public Share (no auth) ----------
async def _load_share_payload(share_token: str) -> Optional[dict]:
    share = await db.activation_shares.find_one({"share_token": share_token}, {"_id": 0})
    if not share:
        return None
    event = await db.activation_events.find_one({"event_id": share["event_id"]}, {"_id": 0})
    if not event:
        return None
    if event["status"] != "active":
        return {"expired": True, "share": share, "event": event}
    owner = await db.users.find_one({"user_id": event["user_id"]}, {"_id": 0})
    profiles = await db.profiles.find({"user_id": event["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
    contacts = await db.contacts.find({"user_id": event["user_id"]}, {"_id": 0}).sort("notify_order", 1).to_list(20)
    # mark viewed
    if not share.get("viewed_at"):
        await db.activation_shares.update_one(
            {"share_token": share_token}, {"$set": {"viewed_at": datetime.now(timezone.utc)}}
        )
    # activation email button links to the HTML page served by backend (not the SPA route)
    # so contacts who don't have JS still see something readable.
    photo_map = {}
    photo_tokens = share.get("photo_tokens", []) or []
    idx = 0
    for p in profiles:
        if p.get("photo_path"):
            if idx < len(photo_tokens):
                photo_map[p["profile_id"]] = photo_tokens[idx]
            idx += 1
    for p in profiles:
        if p.get("photo_path"):
            tok = photo_map.get(p["profile_id"])
            p["photo_url"] = f"/api/files/{p['photo_path']}?token={tok}" if tok else None
    return {
        "expired": False,
        "owner_name": owner.get("name") if owner else "A friend",
        "contact_name": share.get("contact_name"),
        "profiles": profiles,
        "contacts": [{"name": c["name"], "relationship": c.get("relationship"), "phone": c.get("phone"), "email": c.get("email")} for c in contacts],
        "triggered_at": event["triggered_at"].isoformat(),
    }


@api.get("/share/{share_token}")
async def api_share(share_token: str):
    """JSON endpoint used by the in-app deep-link screen."""
    payload = await _load_share_payload(share_token)
    if payload is None:
        raise HTTPException(status_code=404, detail="Invalid link")
    return payload


@app.get("/api/share/{share_token}/page", response_class=HTMLResponse)
@app.get("/share/{share_token}", response_class=HTMLResponse)
async def public_share_html(share_token: str):
    """Plain web page — for trusted contacts who don't have the app."""
    payload = await _load_share_payload(share_token)
    if payload is None:
        return HTMLResponse("<h1>Link not found</h1>", status_code=404)
    if payload.get("expired"):
        return HTMLResponse(
            "<html><body style='font-family:system-ui;padding:40px;max-width:640px;margin:auto;color:#26303B;background:#FAFAF7'>"
            "<h1 style='color:#2C63A0'>This link has expired</h1>"
            "<p>The person who sent this link has marked the situation resolved. Thank you for being there.</p>"
            "</body></html>"
        )
    owner = escape(payload["owner_name"])
    contact = escape(payload["contact_name"] or "friend")
    profile_html = ""
    type_labels = {"pet": "Pet", "dependent": "Dependent", "medication": "Medication", "plant": "Plant", "home": "Home", "other": "Other"}
    for p in payload["profiles"]:
        photo = ""
        if p.get("photo_url"):
            photo = f'<img src="{escape(p["photo_url"])}" alt="" style="width:100%;max-height:280px;object-fit:cover;border-radius:12px;margin-bottom:12px">'
        raw_instr = escape(p.get("care_instructions") or "").replace("\n", "<br>")
        instr_html = raw_instr or '<em style="color:#69747F">No instructions written.</em>'
        profile_html += (
            f'<section style="background:#FFFFFF;border:1px solid #E5E6E0;border-radius:16px;padding:20px;margin-bottom:16px">'
            f'<div style="display:inline-block;background:#ECF1F5;color:#374C60;font-size:13px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:10px">{escape(type_labels.get(p["type"], p["type"]))}</div>'
            f'<h2 style="margin:0 0 12px;font-size:22px;color:#1A2026">{escape(p["name"])}</h2>'
            f'{photo}'
            f'<div style="font-size:16px;line-height:1.6;color:#1A2026">{instr_html}</div>'
            f'</section>'
        )
    contacts_html = ""
    for c in payload["contacts"]:
        parts = []
        if c.get("phone"):
            parts.append(f'<a href="tel:{escape(c["phone"])}" style="color:#2C63A0;text-decoration:none">{escape(c["phone"])}</a>')
        if c.get("email"):
            parts.append(f'<a href="mailto:{escape(c["email"])}" style="color:#2C63A0;text-decoration:none">{escape(c["email"])}</a>')
        contacts_html += (
            f'<div style="padding:12px 0;border-bottom:1px solid #E5E6E0">'
            f'<div style="font-weight:600;color:#1A2026">{escape(c["name"])}{" · " + escape(c["relationship"]) if c.get("relationship") else ""}</div>'
            f'<div style="color:#374C60;margin-top:4px">{" · ".join(parts)}</div>'
            f'</div>'
        )
    empty_p = '<p style="color:#69747F">No profiles were set up.</p>'
    empty_c = '<p style="color:#69747F">None listed.</p>'
    profiles_block = profile_html or empty_p
    contacts_block = contacts_html or empty_c
    return HTMLResponse(
        f'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>Handoff — {owner}</title></head>'
        f'<body style="font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#FAFAF7;color:#1A2026;margin:0">'
        f'<div style="max-width:640px;margin:0 auto;padding:24px">'
        f'<div style="background:#2C63A0;color:#fff;padding:20px;border-radius:16px;margin-bottom:20px">'
        f'<div style="font-size:14px;opacity:0.9">Handoff — Active</div>'
        f'<h1 style="margin:6px 0 4px;font-size:24px">Hi {contact},</h1>'
        f'<div style="font-size:16px;opacity:0.95">{owner} needs your help. Here is exactly what to do.</div>'
        f'</div>'
        f'{profiles_block}'
        f'<h3 style="margin:24px 0 8px;color:#1A2026">Other trusted contacts</h3>'
        f'<div style="background:#FFFFFF;border:1px solid #E5E6E0;border-radius:16px;padding:8px 20px">{contacts_block}</div>'
        f'<p style="text-align:center;color:#69747F;font-size:13px;margin:32px 0 16px">This is a private page. It will expire once {owner} marks the situation resolved.</p>'
        f'</div></body></html>'
    )


# ---------- Subscription (mocked) ----------
@api.post("/subscription/upgrade")
async def upgrade_subscription(tier: str = Form(...), user=Depends(get_current_user)):
    if tier not in ("free", "plus", "family"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"subscription_tier": tier}})
    return {"ok": True, "subscription_tier": tier}


# ---------- Account ----------
@api.delete("/account")
async def delete_account(user=Depends(get_current_user)):
    uid = user["user_id"]
    await db.profiles.delete_many({"user_id": uid})
    await db.contacts.delete_many({"user_id": uid})
    ev_ids = [e["event_id"] async for e in db.activation_events.find({"user_id": uid}, {"_id": 0, "event_id": 1})]
    await db.activation_shares.delete_many({"event_id": {"$in": ev_ids}})
    await db.activation_events.delete_many({"user_id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


@api.get("/")
async def root():
    return {"app": "Handoff", "ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
