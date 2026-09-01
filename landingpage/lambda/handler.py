"""Serve the Vite build from a Lambda Function URL.

The frontend remains a static artifact; Lambda is used only as the requested
AWS delivery surface. Unknown client-side routes fall back to index.html.
"""

from __future__ import annotations

import base64
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote


SITE_ROOT = Path(os.environ.get("SITE_ROOT", "/var/task/site")).resolve()


def _safe_target(raw_path: str) -> Path:
    path = unquote(raw_path or "/").split("?", 1)[0]
    relative = Path(path.lstrip("/") or "index.html")
    target = (SITE_ROOT / relative).resolve()
    if SITE_ROOT not in target.parents and target != SITE_ROOT:
        return SITE_ROOT / "index.html"
    return target


def lambda_handler(event: dict, _context: object) -> dict:
    raw_path = event.get("rawPath") or event.get("path") or "/"
    target = _safe_target(raw_path)

    if target.is_dir():
        target = target / "index.html"
    if not target.exists() or not target.is_file():
        # Vite's client-side routing needs the document shell for unknown paths.
        target = SITE_ROOT / "index.html"

    payload = target.read_bytes()
    content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    is_html = target.suffix.lower() in {".html", ".htm"}
    headers = {
        "content-type": content_type,
        "content-length": str(len(payload)),
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "cache-control": "no-cache" if is_html else "public, max-age=31536000, immutable",
    }
    method = (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()
    return {
        "statusCode": 200,
        "headers": headers,
        "isBase64Encoded": True,
        "body": "" if method == "HEAD" else base64.b64encode(payload).decode("ascii"),
    }

