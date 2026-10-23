import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".ENV")

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlmodel import select

from db import get_session, verify_password
from models import User

JWT_SECRET = os.getenv("JWT_SECRET", "audita-dev-change-this-secret-9f3c2a1b")
JWT_ALG = "HS256"
TOKEN_HOURS = 12
bearer = HTTPBearer(auto_error=False)


def authenticate(username: str, password: str) -> User:
    with get_session() as session:
        user = session.exec(
            select(User).where(func.lower(User.username) == username.strip().lower())
        ).first()
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Usuário ou senha inválidos.")
        return user


def create_token(user: User) -> str:
    payload = {
        "sub": user.username,
        "uid": user.id,
        "exp": datetime.now(UTC) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Faça login para usar o chat.")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        username = payload.get("sub")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.") from exc

    with get_session() as session:
        user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    return user
