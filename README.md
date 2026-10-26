# urban-inspection-web

## Running locally

```powershell
docker compose up -d db

cd backend
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(32))"   # put the output in .env as JWT_SECRET
alembic upgrade head
uvicorn app.main:app --reload
```

The backend does not start without `JWT_SECRET`; it signs the login tokens, so keep it out of git.

```powershell
cd frontend
npm install
npm run dev
```

## Logging in to the API docs

Endpoints marked with a lock need a logged-in user. In Swagger UI at http://localhost:8000/docs:

1. Create an account with `POST /auth/register`.
2. Click **Authorize**, enter your email as the username and your password, then click **Authorize** again.

Swagger then sends the token with every request. `GET /auth/me` shows who you are logged in as.

## Admin accounts

Admins see every account with its usage (last login, workspaces, inspections) and can block or unblock accounts.
A blocked user can't log in, and any session they have open stops working. Admins can't see the contents of other people's workspaces.

Admin rights can only be granted from the command line, never through the website. Register the account in the app first, then run from `backend/`:

```powershell
python -m app.make_admin you@example.com            # grant admin rights
python -m app.make_admin you@example.com --revoke   # remove them
```

Admins can't be blocked; revoke their admin rights first.

## Database migrations

The schema is managed by [Alembic](https://alembic.sqlalchemy.org/); the app does not create tables on startup.
Run these commands from `backend/`:

- `alembic upgrade head` – apply all migrations (also after pulling new ones).
- `alembic revision --autogenerate -m "describe change"` – after changing `app/models.py`, generate a migration, then review the file in `alembic/versions/` before applying it.
- `alembic check` – verify that the models and the database schema match.
- `alembic downgrade -1` – undo the last migration.
