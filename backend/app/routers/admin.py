import shutil
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Row, Select, delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.database import get_db
from app.models import Inspection, Site, User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas import AdminUserOut, KeptWorkspace, UserDeletionPreview
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
        workspaces=workspaces,
        inspections=inspections,
    )


def _get_deletable_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User {user_id} not found")
    if user.is_admin:
        # This also stops admins from deleting themselves.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Admins can't be deleted. Remove their admin rights first with "
            "`python -m app.make_admin EMAIL --revoke`.",
        )
    return user


@dataclass
class _DeletionPlan:
    # The personal workspace, and team workspaces nobody else belongs to.
    deleted: list[Workspace]
    # Team workspaces shared with others, each with the member who takes over as owner, if one must.
    kept: list[tuple[Workspace, WorkspaceMember | None]]

    def deleted_ids(self) -> list[int]:
        return [workspace.id for workspace in self.deleted]


def _plan_deletion(db: Session, user: User) -> _DeletionPlan:
    memberships = db.scalars(
        select(WorkspaceMember)
        .join(WorkspaceMember.workspace)
        .where(WorkspaceMember.user_id == user.id)
        .options(
            selectinload(WorkspaceMember.workspace)
            .selectinload(Workspace.members)
            .selectinload(WorkspaceMember.user)
        )
        .order_by(Workspace.is_personal.desc(), Workspace.name)
    ).all()

    plan = _DeletionPlan(deleted=[], kept=[])
    for membership in memberships:
        workspace = membership.workspace
        others = [member for member in workspace.members if member.user_id != user.id]
        if workspace.is_personal or not others:
            plan.deleted.append(workspace)
            continue
        heir = None
        if membership.role == WorkspaceRole.owner and all(
            member.role != WorkspaceRole.owner for member in others
        ):
            # A workspace always keeps an owner, so the longest-standing member takes over.
            heir = min(others, key=lambda member: (member.added_at, member.user_id))
        plan.kept.append((workspace, heir))
    return plan


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)):
    """All accounts with their usage, oldest first."""
    rows = db.execute(_users_with_usage().order_by(User.created_at, User.id))
    return [_admin_user_out(row) for row in rows]


@router.get("/users/{user_id}/deletion-preview", response_model=UserDeletionPreview)
def preview_user_deletion(user_id: int, db: Session = Depends(get_db)):
    """What `DELETE /admin/users/{user_id}` would remove, for the confirmation dialog."""
    user = _get_deletable_user(db, user_id)
    plan = _plan_deletion(db, user)
    deleted_ids = plan.deleted_ids()
    deleted_inspections = db.scalar(
        select(func.count())
        .select_from(Inspection)
        .join(Inspection.site)
        .where(Site.workspace_id.in_(deleted_ids))
    )
    kept_inspections = db.scalar(
        select(func.count())
        .select_from(Inspection)
        .join(Inspection.site)
        .where(Inspection.created_by_id == user.id, Site.workspace_id.not_in(deleted_ids))
    )
    return UserDeletionPreview(
        deleted_workspaces=[workspace.name for workspace in plan.deleted],
        deleted_inspections=deleted_inspections,
        kept_workspaces=[
            KeptWorkspace(name=workspace.name, new_owner=heir.user.email if heir else None)
            for workspace, heir in plan.kept
        ],
        kept_inspections=kept_inspections,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Delete an account for good, with its personal workspace and the team workspaces only it belongs to.

    Team workspaces shared with others stay, with everything in them; what the user made there
    keeps no author. Open sessions of the account stop working.
    """
    user = _get_deletable_user(db, user_id)
    plan = _plan_deletion(db, user)
    deleted_ids = plan.deleted_ids()
    inspection_ids = db.scalars(
        select(Inspection.id).join(Inspection.site).where(Site.workspace_id.in_(deleted_ids))
    ).all()

    for _, heir in plan.kept:
        if heir is not None:
            heir.role = WorkspaceRole.owner
    # The database cascades this to the workspaces' members, sites, inspections, images and analyses,
    # and clears the author of whatever the user created in the workspaces that stay.
    db.execute(delete(Workspace).where(Workspace.id.in_(deleted_ids)))
    db.delete(user)
    db.commit()

    # Only after the commit, so a failed delete keeps the files.
    for inspection_id in inspection_ids:
        shutil.rmtree(settings.upload_dir / f"inspection_{inspection_id}", ignore_errors=True)
