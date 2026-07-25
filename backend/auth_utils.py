import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-long-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# bcrypt has a 72-byte limit; truncate to avoid ValueError
BCRYPT_MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")[:BCRYPT_MAX_PASSWORD_BYTES]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    raw = plain.encode("utf-8")[:BCRYPT_MAX_PASSWORD_BYTES]
    return bcrypt.checkpw(raw, hashed.encode("utf-8"))


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
