import os
from typing import Optional

import requests
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from server import db, get_current_user, logger

router = APIRouter(prefix="/api")

STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_PLUS = os.environ.get("STRIPE_PRICE_PLUS")
STRIPE_PRICE_FAMILY = os.environ.get("STRIPE_PRICE_FAMILY")
APP_URL = os.environ.get("APP_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:3000"

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_USERS_TABLE = os.environ.get("SUPABASE_USERS_TABLE", "profiles")

PRICE_IDS = {
    "plus": STRIPE_PRICE_PLUS,
    "family": STRIPE_PRICE_FAMILY,
}

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def _stripe_ready() -> bool:
    return bool(STRIPE_SECRET_KEY and STRIPE_PRICE_PLUS and STRIPE_PRICE_FAMILY and STRIPE_WEBHOOK_SECRET)


async def _sync_supabase_tier(user_id: str, tier: str):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        resp = requests.patch(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{SUPABASE_USERS_TABLE}?user_id=eq.{user_id}",
            json={"subscription_tier": tier},
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            timeout=15,
        )
        if resp.status_code not in (200, 201, 204, 404):
            logger.warning("Supabase subscription sync returned %s: %s", resp.status_code, resp.text)
    except Exception as exc:  # pragma: no cover
        logger.warning("Supabase subscription sync failed: %s", exc)


async def _update_user_subscription(user_id: str, tier: str, stripe_customer_id: Optional[str] = None):
    payload = {"subscription_tier": tier}
    if stripe_customer_id:
        payload["stripe_customer_id"] = stripe_customer_id
    await db.users.update_one({"user_id": user_id}, {"$set": payload})
    await _sync_supabase_tier(user_id, tier)


async def _get_user_by_stripe_customer(stripe_customer_id: str):
    if not stripe_customer_id:
        return None
    return await db.users.find_one({"stripe_customer_id": stripe_customer_id}, {"_id": 0})


def _resolve_tier_from_price_id(price_id: Optional[str]) -> Optional[str]:
    if not price_id:
        return None
    for tier, value in PRICE_IDS.items():
        if value == price_id:
            return tier
    return None


def _resolve_tier_from_subscription_object(obj: dict) -> Optional[str]:
    metadata_tier = (obj.get("metadata") or {}).get("tier")
    if metadata_tier in {"free", "plus", "family"}:
        return metadata_tier

    item_data = obj.get("items") or {}
    items = item_data.get("data") if isinstance(item_data, dict) else []
    for item in items:
        price_id = (item.get("price") or {}).get("id")
        tier = _resolve_tier_from_price_id(price_id)
        if tier:
            return tier
    return None


@router.post("/stripe/checkout")
async def create_checkout_session(request: Request, user=Depends(get_current_user)):
    if not _stripe_ready():
        raise HTTPException(status_code=500, detail="Stripe is not configured. Add STRIPE_SECRET_KEY, STRIPE_PRICE_PLUS, STRIPE_PRICE_FAMILY, and STRIPE_WEBHOOK_SECRET.")

    payload = await request.json()
    tier = (payload or {}).get("tier")
    if tier not in {"plus", "family"}:
        raise HTTPException(status_code=400, detail="Tier must be 'plus' or 'family'.")

    price_id = PRICE_IDS.get(tier)
    if not price_id:
        raise HTTPException(status_code=500, detail=f"Price ID for {tier} is not configured.")

    stripe_customer_id = user.get("stripe_customer_id")
    if not stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.get("email"),
            name=user.get("name"),
            metadata={"user_id": user["user_id"]},
        )
        stripe_customer_id = customer.id
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"stripe_customer_id": stripe_customer_id}})

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=stripe_customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{APP_URL.rstrip('/')}/settings?checkout=success",
        cancel_url=f"{APP_URL.rstrip('/')}/settings?checkout=cancel",
        allow_promotion_codes=True,
        metadata={"user_id": user["user_id"], "tier": tier},
    )
    return {"url": session.url, "tier": tier}


@router.post("/stripe/portal")
async def create_customer_portal(user=Depends(get_current_user)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured.")

    stripe_customer_id = user.get("stripe_customer_id")
    if not stripe_customer_id:
        raise HTTPException(status_code=404, detail="No Stripe customer was created for this user yet.")

    portal = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{APP_URL.rstrip('/')}/settings",
    )
    return {"url": portal.url}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Stripe webhook secret is not configured.")

    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    if not sig:
        raise HTTPException(status_code=400, detail="Missing Stripe signature.")

    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")

    event_type = event.get("type")
    obj = event.get("data", {}).get("object") or {}
    if not isinstance(obj, dict):
        return JSONResponse({"ok": True})

    stripe_customer_id = obj.get("customer")
    metadata_user_id = (obj.get("metadata") or {}).get("user_id")
    resolved_tier = _resolve_tier_from_subscription_object(obj)

    if event_type in {"customer.subscription.created", "customer.subscription.updated"}:
        if resolved_tier:
            if metadata_user_id:
                await _update_user_subscription(metadata_user_id, resolved_tier, stripe_customer_id)
            user = await _get_user_by_stripe_customer(stripe_customer_id)
            if user:
                await _update_user_subscription(user["user_id"], resolved_tier, stripe_customer_id)
        return JSONResponse({"ok": True})

    if event_type == "checkout.session.completed":
        metadata_tier = (obj.get("metadata") or {}).get("tier")
        if metadata_tier in {"plus", "family"}:
            user_id = (obj.get("metadata") or {}).get("user_id")
            if user_id:
                await _update_user_subscription(user_id, metadata_tier, stripe_customer_id)
        return JSONResponse({"ok": True})

    if event_type == "customer.subscription.deleted":
        if metadata_user_id:
            await _update_user_subscription(metadata_user_id, "free", stripe_customer_id)
        else:
            user = await _get_user_by_stripe_customer(stripe_customer_id)
            if user:
                await _update_user_subscription(user["user_id"], "free", stripe_customer_id)
        return JSONResponse({"ok": True})

    return JSONResponse({"ok": True})


@router.post("/subscription/upgrade")
async def legacy_upgrade_subscription(request: Request, user=Depends(get_current_user)):
    payload = await request.json()
    tier = (payload or {}).get("tier")
    if tier not in ("free", "plus", "family"):
        raise HTTPException(status_code=400, detail="Invalid tier")

    if tier == "free":
        await _update_user_subscription(user["user_id"], "free")
        return {"ok": True, "subscription_tier": "free"}

    if not _stripe_ready():
        raise HTTPException(status_code=501, detail="Stripe checkout is not configured yet. Use /api/stripe/checkout to create a Stripe Checkout session.")

    return await create_checkout_session(request, user)
