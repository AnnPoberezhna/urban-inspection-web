from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Row, Select, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Inspection, User, WorkspaceMember
from app.schemas import AdminUserOut
from app.security import require_admin

# Accounts only: admins see usage counts, never the contents of other people's workspaces.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _users_with_usage() -> Select[tuple[User, int, int]]:
    workspaces = (
        select(func.count())
        .select_from(WorkspaceMember)
        .where(WorkspaceMember.user_id == User.id)
        .scalar_subquery()
    )
    inspections = (
        select(func.count())
        .select_from(Inspection)
        .where(Inspection.created_by_id == User.id)
        .scalar_subquery()
    )
    return select(User, workspaces, inspections)


def _admin_user_out(row: Row[tuple[User, int, int]]) -> AdminUserOut:
    user, workspaces, inspections = row
    return AdminUserOut(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        is_admin=user.is_admin,
        blocked_at=user.blocked_at,
        workspaces=workspaces,
        inspections=inspections,
    )


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User {user_id} not found")
    return user


def _user_out(db: Session, user_id: int) -> AdminUserOut:
    return _admin_user_out(db.execute(_users_with_usage().where(User.id == user_id)).one())


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)):
    """All accounts with their usage, oldest first."""
    rows = db.execute(_users_with_usage().order_by(User.created_at, User.id))
    return [_admin_user_out(row) for row in rows]


@router.post("/users/{user_id}/block", response_model=AdminUserOut)
def block_user(user_id: int, db: Session = Depends(get_db)):
    """Block an account: the user can't log in, and their open sessions stop working."""
    user = _get_user(db, user_id)
    if user.is_admin:
        # This also stops admins from locking themselves out.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Admins can't be blocked. Remove their admin rights first with "
            "`python -m app.make_admin EMAIL --revoke`.",
        )
    if user.blocked_at is None:
        user.blocked_at = datetime.now(timezone.utc)
        db.commit()
    return _user_out(db, user_id)


@router.post("/users/{user_id}/unblock", response_model=AdminUserOut)
def unblock_user(user_id: int, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    if user.blocked_at is not None:
        user.blocked_at = None
        db.commit()
    return _user_out(db, user_id)
