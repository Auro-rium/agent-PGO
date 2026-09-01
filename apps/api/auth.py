"""API-key issuance and request authentication helpers."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ApiKey


def hash_api_key(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def issue_api_key(*, organization_id: str, project_id: str | None = None, name: str = "default") -> tuple[str, ApiKey]:
    secret = "agp_" + secrets.token_urlsafe(32)
    return secret, ApiKey(
        organization_id=organization_id,
        project_id=project_id,
        name=name,
        key_prefix=secret[:12],
        key_hash=hash_api_key(secret),
    )


@dataclass(frozen=True)
class Tenant:
    organization_id: str
    project_id: str | None
    api_key_id: str


def _extract_key(request: Request, authorization: str | None, x_api_key: str | None) -> str:
    candidate = x_api_key or request.headers.get("X-AgentPGO-API-Key")
    if candidate:
        return candidate.strip()
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value.strip():
            return value.strip()
    raise HTTPException(status_code=401, detail="Missing API key", headers={"WWW-Authenticate": "Bearer"})


def authenticate(
    request: Request,
    session: Session,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> Tenant:
    secret = _extract_key(request, authorization, x_api_key)
    if len(secret) > 512:
        raise HTTPException(status_code=401, detail="Invalid API key")
    key = session.scalar(select(ApiKey).where(ApiKey.key_hash == hash_api_key(secret), ApiKey.revoked_at.is_(None)))
    if key is None:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return Tenant(str(key.organization_id), str(key.project_id) if key.project_id else None, str(key.id))


def revoke_api_key(key: ApiKey) -> None:
    key.revoked_at = datetime.now(timezone.utc)
