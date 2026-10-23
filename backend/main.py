import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from auth import authenticate, create_token, get_current_user, register_user
from db import init_db
from models import User

ROOT_DIR = Path(__file__).resolve().parent
STATIC_DIR = ROOT_DIR / "static"
load_dotenv(ROOT_DIR / ".ENV")
init_db()

MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
OPENROUTER_URL = f"{os.getenv('OPENROUTER_BASE_URL')}/chat/completions"
HEADERS = {
    "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
    "Content-Type": "application/json",
}

app = FastAPI(title="Chat OpenRouter")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


class ChatResponse(BaseModel):
    response: str


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    token: str
    username: str


def ask_openrouter(message: str) -> str:
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": message}],
        "reasoning": {"enabled": True},
        "provider": {"only": ["nvidia"], "allow_fallbacks": False},
    }
    try:
        data = requests.post(
            OPENROUTER_URL,
            headers=HEADERS,
            data=json.dumps(payload),
            timeout=120,
        )
        data.raise_for_status()
        body = data.json()
        return body["choices"][0]["message"]["content"]
    except (requests.RequestException, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Falha no OpenRouter: {exc}") from exc


@app.get("/")
def home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/css/{filename}")
def css_file(filename: str) -> FileResponse:
    path = STATIC_DIR / "css" / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return FileResponse(path)


@app.get("/js/{filename}")
def js_file(filename: str) -> FileResponse:
    path = STATIC_DIR / "js" / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return FileResponse(path)


@app.post("/register", response_model=LoginResponse)
def register(req: LoginRequest) -> LoginResponse:
    user = register_user(req.username, req.password)
    return LoginResponse(token=create_token(user), username=user.username)


@app.post("/login", response_model=LoginResponse)
def login(req: LoginRequest) -> LoginResponse:
    user = authenticate(req.username, req.password)
    return LoginResponse(token=create_token(user), username=user.username)


@app.get("/me")
def me(user: User = Depends(get_current_user)) -> dict[str, str]:
    return {"username": user.username}


@app.post("/", response_model=ChatResponse)
def chat(req: ChatRequest, user: User = Depends(get_current_user)) -> ChatResponse:
    _ = user
    return ChatResponse(response=ask_openrouter(req.message))
