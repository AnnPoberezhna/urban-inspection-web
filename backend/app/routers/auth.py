from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas import Token, UserCreate, UserOut
from app.security import (
    BLOCKED_MESSAGE,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate, db: Session = Depends(get_db)):
    """Create an account together with its private "Personal" workspace."""
    user = User(email=body.email.lower(), password_hash=hash_password(body.password))
    workspace = Workspace(name="Personal", is_personal=True, created_by=user)
    workspace.members.append(WorkspaceMember(user=user, role=WorkspaceRole.owner))
    db.add(workspace)
    try:
        db.commit()
    except IntegrityError:
        # The unique constraint on users.email also catches two sign-ups racing each other.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already registered")
    return user


@router.post("/token", response_model=Token)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], db: Session = Depends(get_db)
):
    """Log in with email (in the username field) and password. Used by the Authorize button in /docs."""
    user = db.scalar(select(User).where(User.email == form.username.strip().lower()))
    if not verify_password(form.password, user.password_hash if user else None):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Only after the password check, so the blocked status isn't revealed to someone guessing.
    if user.blocked_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, BLOCKED_MESSAGE)

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
