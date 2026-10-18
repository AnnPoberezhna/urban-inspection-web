# urban-inspection-web

## Running locally

```powershell
docker compose up -d db

cd backend
.\.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

```powershell
cd frontend
npm install
npm run dev
```

## Database migrations

The schema is managed by [Alembic](https://alembic.sqlalchemy.org/); the app does not create tables on startup.
Run these commands from `backend/`:

- `alembic upgrade head` – apply all migrations (also after pulling new ones).
- `alembic revision --autogenerate -m "describe change"` – after changing `app/models.py`, generate a migration, then review the file in `alembic/versions/` before applying it.
- `alembic check` – verify that the models and the database schema match.
- `alembic downgrade -1` – undo the last migration.
