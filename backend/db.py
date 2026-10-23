import os
from pathlib import Path

import bcrypt
from sqlmodel import Session, SQLModel, create_engine, select

from models import User

DB_PATH = Path(os.getenv("SQLITE_PATH", Path(__file__).resolve().parent / "chat.db"))
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

FIRST_USER = "Claison"
FIRST_PASSWORD = "1234"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def get_session() -> Session:
    return Session(engine)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        exists = session.exec(select(User).where(User.username == FIRST_USER)).first()
        if exists:
            return
        session.add(User(username=FIRST_USER, password_hash=hash_password(FIRST_PASSWORD)))
        session.commit()
