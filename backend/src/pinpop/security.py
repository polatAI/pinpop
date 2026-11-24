from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_SCRYPT = {"n": 16384, "r": 8, "p": 1, "dklen": 64}
_MAXMEM = 64 * 1024 * 1024
BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def _scrypt(password: str, salt: bytes, *, n: int, r: int, p: int, dklen: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=dklen, maxmem=_MAXMEM)


async def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = await asyncio.to_thread(_scrypt, password, salt, **_SCRYPT)
    b64 = base64.b64encode
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${b64(salt).decode()}${b64(digest).decode()}"


async def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 6 or parts[0] != "scrypt":
        return False
    _, n, r, p, salt_b64, hash_b64 = parts
    try:
        expected = base64.b64decode(hash_b64)
        actual = await asyncio.to_thread(
            _scrypt, password, base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except ValueError:
        return False
    return hmac.compare_digest(actual, expected)


def random_token(length: int = 32) -> str:
    return "".join(BASE62[b % 62] for b in secrets.token_bytes(length))


def new_id(length: int = 16) -> str:
    return random_token(length)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _secret_key(app_secret: str) -> bytes:
    return hashlib.sha256(f"pinpop:secrets:{app_secret}".encode()).digest()


def encrypt_secret(plain: str, app_secret: str) -> str:
    """AES-256-GCM encryption for secrets at rest (e.g. user-provided AI keys)."""
    iv = secrets.token_bytes(12)
    sealed = AESGCM(_secret_key(app_secret)).encrypt(iv, plain.encode(), None)
    data, tag = sealed[:-16], sealed[-16:]
    b64 = base64.b64encode
    return ".".join(["v1", b64(iv).decode(), b64(tag).decode(), b64(data).decode()])


def decrypt_secret(encoded: str, app_secret: str) -> str | None:
    try:
        version, iv_b64, tag_b64, data_b64 = encoded.split(".")
        if version != "v1":
            return None
        iv, tag, data = (base64.b64decode(x) for x in (iv_b64, tag_b64, data_b64))
        return AESGCM(_secret_key(app_secret)).decrypt(iv, data + tag, None).decode()
    except Exception:
        return None
