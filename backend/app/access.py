from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User, WorkspaceMember, WorkspaceRole


def get_membership(db: Session, user: User, workspace_id: int) -> WorkspaceMember:
    """The user's membership in a workspace. 404 for non-members, so other people's workspace IDs stay hidden."""
    membership = db.get(WorkspaceMember, (workspace_id, user.id))
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Workspace {workspace_id} not found")
    return membership


def require_owner(db: Session, user: User, workspace_id: int) -> WorkspaceMember:
    membership = get_membership(db, user, workspace_id)
    if membership.role != WorkspaceRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workspace owners can do this")
    return membership
