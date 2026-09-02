"""Dodo Payments boundary for server-side checkout and webhooks.

The provider client is deliberately a tiny protocol so tests and local
development can inject a fake without making network calls. Dodo credentials
are read only at call time from runtime environment/Secrets Manager-backed
environment variables.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen
from uuid import uuid4

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import BillingCheckout, BillingWebhookEvent, Membership, Organization, User, utc_now


class DodoClient(Protocol):
    def create_checkout_session(self, payload: dict[str, Any], *, idempotency_key: str) -> dict[str, Any]: ...


class DodoConfigurationError(RuntimeError):
    pass


class DodoProviderError(RuntimeError):
    pass


class HttpDodoClient:
    """Minimal dependency-free Dodo REST client for the checkout call."""

    def create_checkout_session(self, payload: dict[str, Any], *, idempotency_key: str) -> dict[str, Any]:
        token = os.getenv("DODO_PAYMENTS_API_KEY", "").strip()
        product_id = os.getenv("DODO_PRO_PRODUCT_ID", "").strip()
        if not token or not product_id:
            raise DodoConfigurationError("Dodo checkout is not configured")
        environment = os.getenv("DODO_PAYMENTS_ENVIRONMENT", "test_mode").strip().lower()
        default_base = "https://live.dodopayments.com" if environment == "live_mode" else "https://test.dodopayments.com"
        base_url = os.getenv("DODO_API_BASE_URL", default_base).strip().rstrip("/")
        request_payload = {"product_cart": [{"product_id": product_id, "quantity": 1}], **payload}
        encoded = json.dumps(request_payload, separators=(",", ":")).encode("utf-8")
        req = UrlRequest(
            f"{base_url}/checkouts",
            data=encoded,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Idempotency-Key": idempotency_key,
            },
        )
        try:
            with urlopen(req, timeout=float(os.getenv("DODO_TIMEOUT_SECONDS", "15"))) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise DodoProviderError(f"Dodo checkout failed with status {exc.code}") from exc
        except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            raise DodoProviderError("Dodo checkout request failed") from exc
        if not isinstance(result, dict) or not result.get("session_id"):
            raise DodoProviderError("Dodo returned an invalid checkout response")
        return result


class CheckoutRequest(BaseModel):
    model_config = {"populate_by_name": True}
    plan: str = Field(min_length=1, max_length=16)
    referral_code: str | None = Field(default=None, alias="referralCode", max_length=128)

    @field_validator("plan")
    @classmethod
    def only_pro(cls, value: str) -> str:
        value = value.strip().lower()
        if value != "pro":
            raise ValueError("only the pro plan is available for checkout")
        return value


def _request_hash(body: CheckoutRequest) -> str:
    value = json.dumps(body.model_dump(by_alias=True, exclude_none=True), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verify_dodo_signature(raw_body: bytes, *, webhook_id: str, signature: str, timestamp: str, secret: str | None = None) -> bool:
    """Verify Standard Webhooks HMAC signatures with replay protection."""
    key = (secret or os.getenv("DODO_PAYMENTS_WEBHOOK_KEY", "")).strip()
    if not key or not webhook_id or not signature or not timestamp:
        return False
    try:
        sent_at = int(timestamp)
    except (TypeError, ValueError):
        return False
    tolerance = int(os.getenv("DODO_WEBHOOK_TOLERANCE_SECONDS", "300"))
    if tolerance > 0 and abs(int(time.time()) - sent_at) > tolerance:
        return False
    signed = f"{webhook_id}.{timestamp}.".encode("utf-8") + raw_body
    # Standard Webhooks secrets are usually whsec_ + base64, while accepting
    # raw test secrets keeps local contract tests simple.
    keys = [key.encode("utf-8")]
    if key.startswith("whsec_"):
        try:
            keys.insert(0, base64.b64decode(key[6:] + "=" * (-len(key[6:]) % 4)))
        except (ValueError, base64.binascii.Error):
            return False
    expected_values: set[str] = set()
    for signing_key in keys:
        digest = hmac.new(signing_key, signed, hashlib.sha256).digest()
        expected_values.update({base64.b64encode(digest).decode("ascii"), digest.hex()})
    return any(hmac.compare_digest(part.removeprefix("v1,"), expected) for part in signature.split(" ") for expected in expected_values)


def _iso_date(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _event_data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data", {})
    return data if isinstance(data, dict) else {}


def _subscription_fields(data: dict[str, Any]) -> tuple[str | None, str | None, datetime | None]:
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}
    customer_id = data.get("customer_id") or customer.get("customer_id")
    subscription_id = data.get("subscription_id")
    expiry = _iso_date(data.get("next_billing_date") or data.get("current_period_end") or data.get("expires_at"))
    return (str(customer_id) if customer_id else None, str(subscription_id) if subscription_id else None, expiry)


def _apply_subscription_event(session: Session, event_type: str, payload: dict[str, Any]) -> bool:
    data = _event_data(payload)
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    if isinstance(data.get("metadata"), dict):
        metadata = {**metadata, **data["metadata"]}
    organization_id = metadata.get("organization_id") or metadata.get("organizationId")
    customer_id, subscription_id, expiry = _subscription_fields(data)
    organization = session.get(Organization, str(organization_id)) if organization_id else None
    if organization is None and subscription_id:
        organization = session.scalar(select(Organization).where(Organization.dodo_subscription_id == subscription_id))
    if organization is None:
        checkout_id = metadata.get("checkout_id") or metadata.get("checkoutId")
        checkout = session.get(BillingCheckout, str(checkout_id)) if checkout_id else None
        if checkout is None and data.get("session_id"):
            checkout = session.scalar(select(BillingCheckout).where(BillingCheckout.provider_session_id == str(data["session_id"])))
        if checkout is not None:
            organization = session.get(Organization, checkout.organization_id)
    if organization is None:
        return False
    normalized = event_type.lower()
    if normalized in {"subscription.active", "subscription.updated", "subscription.renewed", "subscription.plan_changed", "payment.succeeded"}:
        organization.plan = "pro"
        organization.plan_status = "active"
        organization.plan_source = "dodo"
    elif normalized in {"subscription.on_hold", "subscription.failed", "payment.failed"}:
        organization.plan = "free"
        organization.plan_status = "past_due"
        organization.plan_source = "dodo"
    elif normalized in {"subscription.cancelled", "subscription.canceled", "subscription.expired", "refund.success", "dispute.lost"}:
        organization.plan = "free"
        organization.plan_status = "canceled" if "cancel" in normalized else "expired"
        organization.plan_source = "dodo"
        organization.plan_expires_at = utc_now()
    else:
        return False
    if customer_id:
        organization.dodo_customer_id = customer_id
    if subscription_id:
        organization.dodo_subscription_id = subscription_id
    organization.dodo_subscription_status = normalized.rsplit(".", 1)[-1]
    if expiry:
        organization.plan_expires_at = expiry
    return True


def register_billing_routes(app: Any, *, get_tenant: Any, get_user: Any, get_session: Any) -> None:
    @app.post("/v1/billing/checkout", status_code=201, tags=["billing"])
    def create_checkout(
        body: CheckoutRequest,
        request: Request,
        tenant: Any = Depends(get_tenant),
        user: User = Depends(get_user),
        session: Session = Depends(get_session),
    ) -> dict[str, Any]:
        if session.scalar(select(Membership).where(Membership.user_id == user.id, Membership.organization_id == tenant.organization_id)) is None:
            raise HTTPException(status_code=403, detail="User is not a member of this workspace")
        organization = session.get(Organization, tenant.organization_id)
        if organization is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        if organization.plan == "pro" and organization.plan_status == "active":
            raise HTTPException(status_code=409, detail="Workspace already has an active Pro subscription")
        key = (request.headers.get("Idempotency-Key") or request.headers.get("idempotency-key") or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail="Idempotency-Key header is required")
        digest = _request_hash(body)
        existing = session.scalar(select(BillingCheckout).where(BillingCheckout.organization_id == organization.id, BillingCheckout.idempotency_key == key))
        if existing is not None:
            if existing.request_hash != digest:
                raise HTTPException(status_code=409, detail="Idempotency key was used with a different request")
            if existing.checkout_url:
                return {"checkoutUrl": existing.checkout_url, "checkoutSessionId": existing.provider_session_id, "status": existing.status}
            raise HTTPException(status_code=409, detail="Checkout creation is still in progress")
        metadata = {"organization_id": organization.id, "user_id": user.id}
        if body.referral_code:
            metadata["referral_code"] = body.referral_code
        checkout = BillingCheckout(
            organization_id=organization.id, user_id=user.id, plan="pro", idempotency_key=key,
            request_hash=digest, metadata_json=metadata, status="pending",
        )
        session.add(checkout)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise HTTPException(status_code=409, detail="Checkout request is already being processed") from exc
        return_url = os.getenv("DODO_PAYMENTS_RETURN_URL", "").strip() or f"{os.getenv('APP_ORIGIN', '').rstrip('/')}/profile?billing=complete"
        payload = {"customer": {"email": user.email, "name": user.name}, "metadata": {**metadata, "checkout_id": checkout.id}}
        if return_url:
            payload["return_url"] = return_url
        try:
            result = app.state.dodo_client.create_checkout_session(payload, idempotency_key=key)
        except DodoConfigurationError as exc:
            checkout.status, checkout.error = "failed", "Dodo checkout is not configured"
            session.commit()
            raise HTTPException(status_code=503, detail="Pro checkout is not configured") from exc
        except DodoProviderError as exc:
            checkout.status, checkout.error = "failed", "provider checkout failed"
            session.commit()
            raise HTTPException(status_code=502, detail="Unable to create Pro checkout") from exc
        checkout.provider_session_id = str(result.get("session_id"))
        checkout.checkout_url = str(result.get("checkout_url")) if result.get("checkout_url") else None
        checkout.status = "created"
        session.commit()
        return {"checkoutUrl": checkout.checkout_url, "checkoutSessionId": checkout.provider_session_id, "status": checkout.status}

    @app.get("/v1/billing/entitlement", tags=["billing"])
    def billing_entitlement(tenant: Any = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        organization = session.get(Organization, tenant.organization_id)
        if organization is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"organizationId": organization.id, "plan": organization.plan, "status": organization.plan_status, "source": organization.plan_source, "expiresAt": organization.plan_expires_at.isoformat() if organization.plan_expires_at else None, "subscriptionId": organization.dodo_subscription_id}

    @app.post("/v1/billing/webhooks/dodo", tags=["billing"])
    async def dodo_webhook(request: Request, session: Session = Depends(get_session)) -> dict[str, Any]:
        raw_body = await request.body()
        if len(raw_body) > 2 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Webhook payload is too large")
        webhook_id = request.headers.get("webhook-id", "").strip()
        if not verify_dodo_signature(raw_body, webhook_id=webhook_id, signature=request.headers.get("webhook-signature", ""), timestamp=request.headers.get("webhook-timestamp", "")):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=400, detail="Invalid webhook JSON") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("type"), str):
            raise HTTPException(status_code=422, detail="Webhook event type is required")
        if not webhook_id:
            raise HTTPException(status_code=400, detail="Webhook ID is required")
        existing = session.scalar(select(BillingWebhookEvent).where(BillingWebhookEvent.provider_event_id == webhook_id))
        if existing is not None:
            return {"received": True, "duplicate": True}
        event = BillingWebhookEvent(provider_event_id=webhook_id, event_type=str(payload["type"]), payload=payload, status="received")
        session.add(event)
        session.flush()
        handled = _apply_subscription_event(session, str(payload["type"]), payload)
        event.status = "processed" if handled else "ignored"
        event.processed_at = utc_now()
        session.commit()
        return {"received": True, "duplicate": False, "handled": handled}
