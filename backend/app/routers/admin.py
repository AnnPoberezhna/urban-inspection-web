import shutil
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import Row, Select, delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.database import get_db
from app.models import Inspection, Site, User, Workspace, WorkspaceMember, WorkspaceRole
from app.routers.inspections import get_any_inspection, results_out, summaries_visible_to
from app.routers.workspaces import workspaces_of
from app.schemas import (
    AdminUserOut,
    InspectionResults,
    InspectionSummary,
    UserDeletionPreview,
    WorkspaceOut,
)
from app.security import require_admin

# Admins can delete accounts, and look at everything else read-only, to help users with problems.
# Apart from deleting an account, every endpoint here only reads.
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


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User {user_id} not found")
    return user


def _get_deletable_user(db: Session, user_id: int) -> User:
    user = _get_user(db, user_id)
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
    # Team workspaces shared with others.
    kept: list[Workspace]
    # Kept workspaces the user is the only owner of. A workspace always keeps an owner, and the admin
    # doesn't pick one for the team, so these block the delete until the user makes someone else an owner.
    sole_owner_of: list[Workspace]

    def deleted_ids(self) -> list[int]:
        return [workspace.id for workspace in self.deleted]


def _plan_deletion(db: Session, user: User) -> _DeletionPlan:
    memberships = db.scalars(
        select(WorkspaceMember)
        .join(WorkspaceMember.workspace)
        .where(WorkspaceMember.user_id == user.id)
        .options(selectinload(WorkspaceMember.workspace).selectinload(Workspace.members))
        .order_by(Workspace.is_personal.desc(), Workspace.name)
    ).all()

    plan = _DeletionPlan(deleted=[], kept=[], sole_owner_of=[])
    for membership in memberships:
        workspace = membership.workspace
        others = [member for member in workspace.members if member.user_id != user.id]
        if workspace.is_personal or not others:
            plan.deleted.append(workspace)
            continue
        plan.kept.append(workspace)
        if membership.role == WorkspaceRole.owner and all(
            member.role != WorkspaceRole.owner for member in others
        ):
            plan.sole_owner_of.append(workspace)
    return plan


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)):
    """All accounts with their usage, oldest first."""
    rows = db.execute(_users_with_usage().order_by(User.created_at, User.id))
    return [_admin_user_out(row) for row in rows]


@router.get("/users/{user_id}", response_model=AdminUserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    row = db.execute(_users_with_usage().where(User.id == user_id)).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User {user_id} not found")
    return _admin_user_out(row)


@router.get("/users/{user_id}/workspaces", response_model=list[WorkspaceOut])
def list_user_workspaces(user_id: int, db: Session = Depends(get_db)):
    """The user's workspaces, as their History page lists them."""
    return workspaces_of(db, _get_user(db, user_id))


@router.get("/users/{user_id}/inspections", response_model=list[InspectionSummary])
def list_user_inspections(
    user_id: int, workspace_id: int | None = None, db: Session = Depends(get_db)
):
    """The inspections the user can see, as their History page lists them. Pass workspace_id for one workspace."""
    return summaries_visible_to(db, _get_user(db, user_id), workspace_id)


@router.get("/inspections/{inspection_id}/results", response_model=InspectionResults)
def get_inspection_results(
    inspection_id: int, request: Request, db: Session = Depends(get_db)
):
    """Any inspection's results, as its users see them. There is no admin way to analyze or change it."""
    return results_out(get_any_inspection(db, inspection_id), request)


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
        kept_workspaces=[workspace.name for workspace in plan.kept],
        kept_inspections=kept_inspections,
        sole_owner_of=[workspace.name for workspace in plan.sole_owner_of],
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Delete an account for good, with its personal workspace and the team workspaces only it belongs to.

    Team workspaces shared with others stay, with everything in them; what the user made there
    keeps no author. Not possible while the user is the only owner of such a workspace.
    Open sessions of the account stop working.
    """
    user = _get_deletable_user(db, user_id)
    plan = _plan_deletion(db, user)
    if plan.sole_owner_of:
        names = ", ".join(workspace.name for workspace in plan.sole_owner_of)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{user.email} is the only owner of {names}, which other people use. "
            "They must make another member an owner first.",
        )
    deleted_ids = plan.deleted_ids()
    inspection_ids = db.scalars(
        select(Inspection.id).join(Inspection.site).where(Site.workspace_id.in_(deleted_ids))
    ).all()

    # The database cascades this to the workspaces' members, sites, inspections, images and analyses,
    # and clears the author of whatever the user created in the workspaces that stay.
    db.execute(delete(Workspace).where(Workspace.id.in_(deleted_ids)))
    db.delete(user)
    db.commit()

    # Only after the commit, so a failed delete keeps the files.
    for inspection_id in inspection_ids:
        shutil.rmtree(settings.upload_dir / f"inspection_{inspection_id}", ignore_errors=True)
