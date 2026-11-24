"""`pinpop`: run the server (`pinpop serve`) or apply database migrations (`pinpop migrate`)."""

from __future__ import annotations

import argparse
import asyncio
import logging

import uvicorn

from .app import create_app
from .config import Settings
from .db.database import Database


def main() -> None:
    parser = argparse.ArgumentParser(prog="pinpop", description="Open-source live quiz platform.")
    sub = parser.add_subparsers(dest="command")
    serve = sub.add_parser("serve", help="run the web server (default)")
    serve.add_argument("--reload", action="store_true", help="restart on code changes (development)")
    sub.add_parser("migrate", help="apply database migrations and exit")
    args = parser.parse_args()

    settings = Settings()
    logging.basicConfig(level=settings.LOG_LEVEL.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.command == "migrate":
        db = Database(settings.database_url)
        asyncio.run(db.migrate())
        asyncio.run(db.close())
        return

    logger = logging.getLogger("pinpop")
    logger.info("Pinpop is running at %s", settings.public_url)
    if not settings.AI_PROVIDER:
        logger.info("AI is not configured on the server; users can add their own keys in settings.")
    uvicorn.run(
        "pinpop.app:create_app" if getattr(args, "reload", False) else create_app(settings),
        factory=getattr(args, "reload", False),
        host=settings.HOST,
        port=settings.PORT,
        reload=getattr(args, "reload", False),
        proxy_headers=settings.TRUST_PROXY,
        forwarded_allow_ips="*" if settings.TRUST_PROXY else None,
        log_level=settings.LOG_LEVEL,
    )


if __name__ == "__main__":
    main()
