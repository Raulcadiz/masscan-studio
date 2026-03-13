from sqlalchemy import event
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel, create_engine, Session
from app.config import settings

# NullPool: every thread/coroutine gets its own fresh connection immediately —
# no queue, no "QueuePool limit" timeouts under concurrency.
# Correct for SQLite + WAL mode + check_same_thread=False.
engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=NullPool,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
