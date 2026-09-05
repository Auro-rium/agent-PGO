"""Serve the Vite build from a Lambda Function URL.

The frontend remains a static artifact; Lambda is used only as the requested
AWS delivery surface. Unknown client-side routes fall back to index.html.
"""

from __future__ import annotations

import base64
import mimetypes
import os
import re
from pathlib import Path
from urllib.parse import unquote


SITE_ROOT = Path(os.environ.get("SITE_ROOT", "/var/task/site")).resolve()
BUILD_SHA_FILE = Path(__file__).resolve().with_name("build-sha")


def _build_sha() -> str | None:
    """Return the public CI build identifier bundled with the deployment."""
    try:
        value = BUILD_SHA_FILE.read_text(encoding="ascii").strip()
    except (FileNotFoundError, OSError, UnicodeError):
        return None
    return value if re.fullmatch(r"[0-9a-fA-F]{7,64}", value) else None


def _safe_target(raw_path: str) -> Path:
    path = unquote(raw_path or "/").split("?", 1)[0]
    relative = Path(path.lstrip("/") or "index.html")
    target = (SITE_ROOT / relative).resolve()
    if SITE_ROOT not in target.parents and target != SITE_ROOT:
        return SITE_ROOT / "index.html"
    return target


def _is_static_request(raw_path: str) -> bool:
    """Identify requests for files, which must not receive the SPA shell."""
    path = unquote(raw_path or "/").split("?", 1)[0]
    relative = path.lstrip("/")
    return relative.startswith("assets/") or Path(relative).suffix != ""


def _not_found(method: str) -> dict:
    payload = b"Not found"
    return {
        "statusCode": 404,
        "headers": {
            "content-type": "text/plain; charset=utf-8",
            "content-length": str(len(payload)),
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
        },
        "isBase64Encoded": True,
        "body": "" if method == "HEAD" else base64.b64encode(payload).decode("ascii"),
    }


def _cache_control(target: Path, is_html: bool) -> str:
    """Cache only Vite's content-addressed assets immutably."""
    if is_html:
        return "no-cache"
    hashed_asset = target.parent.name == "assets" and re.search(r"[-_][A-Za-z0-9]{8,}\.", target.name)
    return "public, max-age=31536000, immutable" if hashed_asset else "no-cache"


def lambda_handler(event: dict, _context: object) -> dict:
    raw_path = event.get("rawPath") or event.get("path") or "/"
    method = (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()
    target = _safe_target(raw_path)

    if target.is_dir():
        target = target / "index.html"
    if not target.exists() or not target.is_file():
        if _is_static_request(raw_path):
            return _not_found(method)
        # Vite's client-side routing needs the document shell for unknown paths.
        target = SITE_ROOT / "index.html"

    if not target.exists() or not target.is_file():
        return _not_found(method)

    payload = target.read_bytes()
    content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    is_html = target.suffix.lower() in {".html", ".htm"}
    headers = {
        "content-type": content_type,
        "content-length": str(len(payload)),
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "cache-control": _cache_control(target, is_html),
    }
    build_sha = _build_sha()
    if build_sha:
        headers["x-twinerun-build-sha"] = build_sha
    return {
        "statusCode": 200,
        "headers": headers,
        "isBase64Encoded": True,
        "body": "" if method == "HEAD" else base64.b64encode(payload).decode("ascii"),
    }
