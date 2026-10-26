"""Grant or revoke admin rights. This is the only way to make an admin; the API can't do it.

Run from backend/, after the user has registered in the app:

    python -m app.make_admin you@example.com
    python -m app.make_admin you@example.com --revoke
"""

import argparse
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.make_admin", description=__doc__.splitlines()[0])
    parser.add_argument("email", help="email of a registered user")
    parser.add_argument("--revoke", action="store_true", help="remove admin rights instead of granting them")
    args = parser.parse_args(argv)
    email = args.email.strip().lower()

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            print(f"No user is registered as {email}. Register in the app first.", file=sys.stderr)
            return 1

        if args.revoke:
            user.is_admin = False
            message = f"{email} is no longer an admin."
        else:
            user.is_admin = True
            message = f"{email} is now an admin."
            # A blocked admin couldn't log in to unblock themselves.
            if user.blocked_at is not None:
                user.blocked_at = None
                message += " The account was blocked and has been unblocked."
        db.commit()

    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
