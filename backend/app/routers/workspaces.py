from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session, selectinload

from app.access import get_membership, require_owner
from app.database import get_db
from app.models import Site, User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas import (
    MemberAdd,
    MemberOut,
    MemberRoleUpdate,
    SiteOut,
    WorkspaceCreate,
    WorkspaceOut,
)
from app.security import get_current_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _member_out(member: WorkspaceMember) -> MemberOut:
    return MemberOut(
        user_id=member.user_id, email=member.user.email, role=member.role, added_at=member.added_at
    )


def _owner_count(db: Session, workspace_id: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role == WorkspaceRole.owner,
        )
    )


def workspaces_of(db: Session, user: User) -> list[WorkspaceOut]:
    """Workspaces the user belongs to, with their role in each. The personal one comes first."""
    rows = db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.is_personal.desc(), Workspace.name)
    ).all()
    return [
        WorkspaceOut(id=workspace.id, name=workspace.name, is_personal=workspace.is_personal, role=role)
        for workspace, role in rows
    ]


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Workspaces I belong to, with my role in each. The personal one comes first."""
    return workspaces_of(db, user)


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(
    body: WorkspaceCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Create a team workspace with me as its owner."""
    workspace = Workspace(name=body.name, is_personal=False, created_by=user)
    workspace.members.append(WorkspaceMember(user=user, role=WorkspaceRole.owner))
    db.add(workspace)
    db.commit()
    return WorkspaceOut(
        id=workspace.id, name=workspace.name, is_personal=False, role=WorkspaceRole.owner
    )


@router.get("/{workspace_id}/members", response_model=list[MemberOut])
def list_members(
    workspace_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    get_membership(db, user, workspace_id)
    members = db.scalars(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .options(selectinload(WorkspaceMember.user))
        .order_by(WorkspaceMember.added_at)
    ).all()
    return [_member_out(member) for member in members]


@router.post(
    "/{workspace_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED
)
def add_member(
    workspace_id: int,
    body: MemberAdd,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a registered user to a team workspace by email. Owners only."""
    membership = require_owner(db, user, workspace_id)
    if membership.workspace.is_personal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A personal workspace cannot be shared")

    new_user = db.scalar(select(User).where(User.email == body.email.lower()))
    if new_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No user is registered as {body.email}")

    if db.get(WorkspaceMember, (workspace_id, new_user.id)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{new_user.email} is already a member")

    member = WorkspaceMember(workspace_id=workspace_id, user=new_user, role=WorkspaceRole.member)
    db.add(member)
    db.commit()
    return _member_out(member)


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove someone from a workspace. Owners only; a workspace always keeps at least one owner."""
    require_owner(db, user, workspace_id)
    member = db.get(WorkspaceMember, (workspace_id, user_id))
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User {user_id} is not a member")

    if member.role == WorkspaceRole.owner and _owner_count(db, workspace_id) == 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot remove the last owner")

    db.delete(member)
    db.commit()


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberOut)
def change_member_role(
    workspace_id: int,
    user_id: int,
    body: MemberRoleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Make a member an owner, or an owner a member. Owners only; a workspace always keeps at least one owner."""
    require_owner(db, user, workspace_id)
    member = db.get(WorkspaceMember, (workspace_id, user_id))
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User {user_id} is not a member")

    if (
        member.role == WorkspaceRole.owner
        and body.role == WorkspaceRole.member
        and _owner_count(db, workspace_id) == 1
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot remove the last owner")

    member.role = body.role
    db.commit()
    return _member_out(member)


@router.get("/{workspace_id}/sites", response_model=list[SiteOut])
def list_sites(
    workspace_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Sites in a workspace, by name. The upload form uses this for autocomplete."""
    get_membership(db, user, workspace_id)
    # ST_X/ST_Y only accept geometry, so the geography point is cast first.
    point = cast(Site.location, Geometry)
    rows = db.execute(
        select(Site.id, Site.name, func.ST_Y(point), func.ST_X(point))
        .where(Site.workspace_id == workspace_id)
        .order_by(Site.name)
    ).all()
    return [
        SiteOut(id=site_id, name=name, latitude=latitude, longitude=longitude)
        for site_id, name, latitude, longitude in rows
    ]
