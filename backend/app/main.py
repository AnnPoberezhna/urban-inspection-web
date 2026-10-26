from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db
from app.routers import admin, auth, inspections, workspaces

# The schema is managed by Alembic migrations (alembic upgrade head), not created at startup.
app = FastAPI(title="Urban Inspection API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(inspections.router)
app.include_router(admin.router)

# StaticFiles requires the directory to exist when it is mounted.
settings.upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=settings.upload_dir), name="files")


def _mark_binary_fields(node):
    if isinstance(node, dict):
        if node.get("contentMediaType") == "application/octet-stream":
            node.pop("contentMediaType")
            node["format"] = "binary"
        for value in node.values():
            _mark_binary_fields(value)
    elif isinstance(node, list):
        for value in node:
            _mark_binary_fields(value)


def custom_openapi():
    # Swagger UI shows a file picker for multi-file uploads only with format: binary
    if app.openapi_schema is None:
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        _mark_binary_fields(schema)
        app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "tables": inspect(engine).get_table_names()}
