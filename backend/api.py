from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()

import asyncio
import logging
import json
import re
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from PIL import Image
import io
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from model_logic import predict_image, is_likely_skin_image
from rag_chatbot import ask_chatbot, analyze_skin_image_with_vision, get_chatbot_status
from database import users_collection, conversations_collection
from auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)


class SuppressShutdownErrorsFilter(logging.Filter):
    """Suppress CancelledError/KeyboardInterrupt tracebacks during reload or Ctrl+C (expected shutdown)."""
    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info:
            exc_type = record.exc_info[0]
            if exc_type is not None and issubclass(exc_type, (asyncio.CancelledError, KeyboardInterrupt)):
                return False
        if record.getMessage().find("CancelledError") != -1 or record.getMessage().find("KeyboardInterrupt") != -1:
            return False
        return True


# Suppress CancelledError/KeyboardInterrupt tracebacks on reload or Ctrl+C (expected shutdown)
_root = logging.getLogger()
_root.addFilter(SuppressShutdownErrorsFilter())


# ---------------------------------------------------------------------------
app = FastAPI()
_executor = ThreadPoolExecutor(max_workers=2)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# REQUEST MODELS
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    question: str
    session_id: str | None = None


class SignupRequest(BaseModel):
    email: str
    username: str
    password: str


class LoginRequest(BaseModel):
    email: str | None = None
    username: str | None = None
    password: str


class SettingsUpdateRequest(BaseModel):
    display_name: str | None = None
    analysis_mode: str | None = None
    voice_enabled: bool | None = None
    save_history: bool | None = None
    email_alerts: bool | None = None
    theme_mode: str | None = None


def _build_contextual_chat_question(current_question: str, messages: list[dict], max_turns: int = 3) -> str:
    """Provide short prior context so follow-up prompts remain anchored to prior analysis."""
    if not messages:
        return current_question

    tail = messages[-(max_turns * 2):]
    context_lines: list[str] = []
    for m in tail:
        role = str(m.get("role", "user")).strip().lower()
        text = str(m.get("text", "")).strip()
        if not text:
            continue
        if role == "user":
            context_lines.append(f"User: {text}")
        else:
            context_lines.append(f"Assistant: {text}")

    if not context_lines:
        return current_question

    return (
        "Conversation context (recent):\n"
        + "\n".join(context_lines)
        + "\n\nCurrent user follow-up:\n"
        + current_question
    )


# ---------------------------------------------------------------------------
# AUTH DEPENDENCY (optional – for routes that work with or without login)
# ---------------------------------------------------------------------------
def get_current_user_optional(
    authorization: str | None = Header(None),
) -> dict | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload or "user_id" not in payload:
        return None
    return {"user_id": payload["user_id"], "email": payload.get("email"), "username": payload.get("username")}


DEFAULT_USER_SETTINGS = {
    "display_name": "",
    "analysis_mode": "balanced",
    "voice_enabled": True,
    "save_history": True,
    "email_alerts": False,
    "theme_mode": "dark",
}


def _public_user_payload(user_doc: dict) -> dict:
    return {
        "id": str(user_doc["_id"]),
        "email": user_doc["email"],
        "username": user_doc["username"],
        "settings": user_doc.get("settings", DEFAULT_USER_SETTINGS.copy()),
    }


def _extract_prediction_from_question(question: str) -> tuple[str | None, float | None]:
    match = re.search(
        r"Image prediction:\s*([^()]+?)\s*\(confidence:\s*([0-9]+(?:\.[0-9]+)?)%\)",
        question,
        re.IGNORECASE,
    )
    if not match:
        return None, None
    label = match.group(1).strip()
    try:
        confidence = float(match.group(2))
    except ValueError:
        confidence = None
    return label, confidence


def _parse_ai_payload(text: str) -> dict | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _condition_from_case(label: str | None, ai_payload: dict | None) -> str:
    if label:
        return label
    if ai_payload:
        if ai_payload.get("mode") == "invalid":
            return "Non-skin upload"
        assessment = str(ai_payload.get("assessment") or ai_payload.get("message") or "").strip()
        if assessment:
            return assessment.split(".")[0][:70]
    return "General dermatology"


def _risk_level(condition: str, ai_payload: dict | None, confidence: float | None) -> str:
    joined = (condition + " " + str(ai_payload.get("assessment", "") if ai_payload else "")).lower()
    high_keywords = ("melanoma", "carcinoma", "malignant", "cancer", "urgent", "high risk")
    medium_keywords = ("infection", "worsen", "moderate", "suspicious", "psoriasis")
    if any(k in joined for k in high_keywords):
        return "High"
    if any(k in joined for k in medium_keywords):
        return "Medium"
    if confidence is not None and confidence < 65:
        return "Medium"
    return "Low"


def _relative_time(dt: datetime | None) -> str:
    if not dt:
        return "Unknown"
    if dt.tzinfo is None:
        now = datetime.utcnow()
    else:
        now = datetime.now(dt.tzinfo)
    delta = now - dt
    seconds = max(0, int(delta.total_seconds()))
    if seconds < 60:
        return "Just now"
    if seconds < 3600:
        return f"{seconds // 60} min ago"
    if seconds < 86400:
        return f"{seconds // 3600} hr ago"
    return f"{seconds // 86400} day ago" if seconds < 172800 else f"{seconds // 86400} days ago"


def _empty_dashboard_summary() -> dict:
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return {
        "totals": {
            "patients_analyzed": 0,
            "model_confidence_avg": 0,
            "high_risk_cases_flagged": 0,
        },
        "risk_breakdown": {
            "low": 0,
            "medium": 0,
            "high": 0,
        },
        "weekly_activity": [{"day": day, "analyses": 0, "flagged": 0} for day in day_names],
        "confidence_by_condition": [],
        "recent_cases": [],
    }


# ---------------------------------------------------------------------------
# AUTH ROUTES
# ---------------------------------------------------------------------------
@app.post("/auth/signup")
async def signup(body: SignupRequest):
    if not body.email or not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Email, username and password required")
    existing = await users_collection.find_one({"$or": [{"email": body.email}, {"username": body.username}]})
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already registered")
    doc = {
        "email": body.email.strip().lower(),
        "username": body.username.strip(),
        "password_hash": hash_password(body.password),
        "settings": DEFAULT_USER_SETTINGS.copy(),
        "created_at": datetime.utcnow(),
    }
    result = await users_collection.insert_one(doc)
    user_id = str(result.inserted_id)
    token = create_access_token({
        "user_id": user_id,
        "email": doc["email"],
        "username": doc["username"],
    })
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": doc["email"],
            "username": doc["username"],
            "settings": doc["settings"],
        },
    }


@app.post("/auth/login")
async def login(body: LoginRequest):
    if not body.password:
        raise HTTPException(status_code=400, detail="Password required")
    if not body.email and not body.username:
        raise HTTPException(status_code=400, detail="Email or username required")
    query = {}
    if body.email:
        query["email"] = body.email.strip().lower()
    if body.username:
        query["username"] = body.username.strip()
    if body.email and body.username:
        query = {"$or": [{"email": body.email.strip().lower()}, {"username": body.username.strip()}]}
    user = await users_collection.find_one(query)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email/username or password")
    user_id = str(user["_id"])
    token = create_access_token({
        "user_id": user_id,
        "email": user["email"],
        "username": user["username"],
    })
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user["email"],
            "username": user["username"],
            "settings": user.get("settings", DEFAULT_USER_SETTINGS.copy()),
        },
    }


@app.get("/auth/me")
async def get_me(user: dict | None = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    doc = await users_collection.find_one({"_id": ObjectId(user["user_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": _public_user_payload(doc)}


@app.put("/auth/settings")
async def update_settings(
    body: SettingsUpdateRequest,
    user: dict | None = Depends(get_current_user_optional),
):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")

    incoming = body.model_dump(exclude_unset=True)
    if not incoming:
        raise HTTPException(status_code=400, detail="No settings provided")

    if "analysis_mode" in incoming:
        allowed_modes = {"fast", "balanced", "detailed"}
        if incoming["analysis_mode"] not in allowed_modes:
            raise HTTPException(status_code=400, detail="analysis_mode must be fast, balanced, or detailed")

    if "theme_mode" in incoming:
        allowed_theme_modes = {"light", "dark"}
        if incoming["theme_mode"] not in allowed_theme_modes:
            raise HTTPException(status_code=400, detail="theme_mode must be light or dark")

    if "display_name" in incoming and incoming["display_name"] is not None:
        incoming["display_name"] = incoming["display_name"].strip()[:50]

    await users_collection.update_one(
        {"_id": ObjectId(user["user_id"])},
        {"$set": {f"settings.{k}": v for k, v in incoming.items()}},
    )
    doc = await users_collection.find_one({"_id": ObjectId(user["user_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": _public_user_payload(doc)}


# ---------------------------------------------------------------------------
# CHAT SESSIONS (History) – require auth via Bearer
# ---------------------------------------------------------------------------
@app.get("/chat/sessions")
async def list_sessions(user: dict | None = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    cursor = conversations_collection.find(
        {"user_id": user["user_id"]}
    ).sort("updated_at", -1)
    sessions = []
    async for doc in cursor:
        title = doc.get("title") or "Chat"
        if doc.get("messages"):
            first = doc["messages"][0].get("text", "")[:40]
            title = first + "..." if len(first) >= 40 else first or title
        sessions.append({
            "id": str(doc["_id"]),
            "title": title,
            "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
        })
    return {"sessions": sessions}


@app.get("/chat/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: dict | None = Depends(get_current_user_optional),
):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")
    doc = await conversations_collection.find_one({
        "_id": ObjectId(session_id),
        "user_id": user["user_id"],
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = [
        {"role": m.get("role", "user"), "text": m.get("text", "")}
        for m in doc.get("messages", [])
    ]
    return {"id": str(doc["_id"]), "title": doc.get("title"), "messages": messages}


@app.post("/chat/sessions")
async def create_session(user: dict | None = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    doc = {
        "user_id": user["user_id"],
        "title": "New chat",
        "messages": [],
        "updated_at": datetime.utcnow(),
    }
    result = await conversations_collection.insert_one(doc)
    return {"id": str(result.inserted_id), "title": doc["title"], "messages": []}


@app.delete("/chat/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user: dict | None = Depends(get_current_user_optional),
):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")

    result = await conversations_collection.delete_one({
        "_id": ObjectId(session_id),
        "user_id": user["user_id"],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"ok": True}


@app.get("/dashboard/summary")
async def dashboard_summary(
    user: dict | None = Depends(get_current_user_optional),
    x_timezone_offset_minutes: str | None = Header(None),
):
    if not user:
        raise HTTPException(status_code=401, detail="Login required")

    # Browser sends Date.getTimezoneOffset() minutes. Convert to a fixed tz for consistent bucketing.
    client_tz = datetime.now().astimezone().tzinfo
    if x_timezone_offset_minutes is not None:
        try:
            offset_mins = int(x_timezone_offset_minutes)
            client_tz = timezone(timedelta(minutes=-offset_mins))
        except ValueError:
            client_tz = datetime.now().astimezone().tzinfo

    docs = await conversations_collection.find(
        {"user_id": user["user_id"]}
    ).sort("updated_at", -1).to_list(length=300)

    if not docs:
        return _empty_dashboard_summary()

    now_local = datetime.now(client_tz)
    weekday_counts: dict[int, dict[str, int]] = {i: {"analyses": 0, "flagged": 0} for i in range(7)}
    conditions: dict[str, list[float]] = {}
    recent_cases: list[dict] = []
    confidence_values: list[float] = []
    high_risk = 0
    medium_risk = 0
    low_risk = 0
    cases_analyzed = 0

    for doc in docs:
        messages = doc.get("messages", [])
        if not messages:
            continue

        last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        last_ai = next((m for m in reversed(messages) if m.get("role") == "ai"), None)
        if not last_user:
            continue

        question = str(last_user.get("text") or "")
        answer = str(last_ai.get("text") or "") if last_ai else ""
        label, confidence = _extract_prediction_from_question(question)
        ai_payload = _parse_ai_payload(answer)
        condition = _condition_from_case(label, ai_payload)
        risk = _risk_level(condition, ai_payload, confidence)
        cases_analyzed += 1

        if confidence is not None:
            confidence_values.append(confidence)
            conditions.setdefault(condition, []).append(confidence)

        if risk == "High":
            high_risk += 1
        elif risk == "Medium":
            medium_risk += 1
        else:
            low_risk += 1

        local_dt: datetime | None = None
        timestamped_user_messages = [
            m.get("created_at")
            for m in messages
            if m.get("role") == "user" and isinstance(m.get("created_at"), datetime)
        ]

        def _add_weekday_count(event_dt: datetime) -> None:
            nonlocal local_dt
            if event_dt.tzinfo is None:
                local_dt = event_dt.replace(tzinfo=timezone.utc).astimezone(client_tz)
            else:
                local_dt = event_dt.astimezone(client_tz)

            weekday = local_dt.weekday()
            day_delta = (now_local.date() - local_dt.date()).days
            if 0 <= day_delta < 7:
                weekday_counts[weekday]["analyses"] += 1
                if risk == "High":
                    weekday_counts[weekday]["flagged"] += 1

        if timestamped_user_messages:
            for event_dt in timestamped_user_messages:
                _add_weekday_count(event_dt)
        else:
            updated_at = doc.get("updated_at")
            if isinstance(updated_at, datetime):
                # Backward compatibility for older conversations without per-message timestamps.
                _add_weekday_count(updated_at)

        if len(recent_cases) < 8:
            case_id = f"DS-{str(doc.get('_id'))[-4:]}"
            recent_cases.append({
                "id": case_id,
                "condition": condition,
                "risk": risk,
                "confidence": confidence,
                "time": _relative_time(local_dt),
            })

    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekly_activity = [
        {
            "day": day_names[i],
            "analyses": weekday_counts[i]["analyses"],
            "flagged": weekday_counts[i]["flagged"],
        }
        for i in range(7)
    ]

    ranked_conditions = sorted(
        conditions.items(),
        key=lambda item: (sum(item[1]) / len(item[1])) if item[1] else 0,
        reverse=True,
    )[:5]

    confidence_by_condition = [
        {
            "name": name,
            "confidence": round(sum(vals) / len(vals), 1),
        }
        for name, vals in ranked_conditions
        if vals
    ]

    return {
        "totals": {
            "patients_analyzed": cases_analyzed,
            "model_confidence_avg": round(sum(confidence_values) / len(confidence_values), 1) if confidence_values else 0,
            "high_risk_cases_flagged": high_risk,
        },
        "risk_breakdown": {
            "low": low_risk,
            "medium": medium_risk,
            "high": high_risk,
        },
        "weekly_activity": weekly_activity,
        "confidence_by_condition": confidence_by_condition,
        "recent_cases": recent_cases,
    }


# ---------------------------------------------------------------------------
# IMAGE PREDICTION
# ---------------------------------------------------------------------------
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png"}


def _ensure_serializable(obj):
    """Ensure prediction result uses native Python types for JSON (no numpy/torch)."""
    if isinstance(obj, dict):
        return {k: _ensure_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_ensure_serializable(v) for v in obj]
    if hasattr(obj, "item"):  # numpy/torch scalar
        return float(obj) if isinstance(obj.item(), (int, float)) else obj.item()
    return obj


def _resize_image_for_vision(image: Image.Image, max_bytes: int = 2_400_000) -> bytes:
    """Resize image so JPEG bytes stay under max_bytes (base64 stays under 4MB)."""
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=88)
    if buf.tell() <= max_bytes:
        return buf.getvalue()
    # Scale down by factor of 0.7 until under limit
    w, h = image.size
    while buf.tell() > max_bytes and (w > 320 or h > 320):
        w, h = int(w * 0.7), int(h * 0.7)
        resized = image.resize((w, h), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        resized.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if file.content_type and file.content_type.lower() not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG or PNG.")
    try:
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty file. Please upload a valid image.")
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {str(e)}")

    is_skin, skin_metrics = is_likely_skin_image(image)
    if not is_skin:
        raise HTTPException(
            status_code=422,
            detail=(
                "The uploaded image does not appear to show a skin region. "
                "Please upload a clear close-up of affected skin only. "
                f"(skin_ratio={skin_metrics['skin_ratio']:.3f})"
            ),
        )

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(_executor, lambda: predict_image(image))
        # Return plain JSON-safe dict (no numpy/torch); no report or Grad-CAM
        return _ensure_serializable({
            "label": result["label"],
            "confidence": result["confidence"],
            "differential": result.get("differential") or [],
        })
    except (FileNotFoundError, OSError) as e:
        raise HTTPException(
            status_code=503,
            detail="Model not found or invalid. Ensure backend/best_small_model contains config and weights.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/analyze-image")
async def analyze_image(
    file: UploadFile = File(...),
    symptoms: str = Form(""),
):
    """Analyze skin image using LLM vision (Groq Llama 4 Scout). Returns clinical-style text for RAG."""
    if file.content_type and file.content_type.lower() not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG or PNG.")
    try:
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty file. Please upload a valid image.")
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {str(e)}")

    is_skin, skin_metrics = is_likely_skin_image(image)
    if not is_skin:
        raise HTTPException(
            status_code=422,
            detail=(
                "The uploaded image does not appear to show a skin region. "
                "Please upload a clear close-up of affected skin only. "
                f"(skin_ratio={skin_metrics['skin_ratio']:.3f})"
            ),
        )

    image_bytes = _resize_image_for_vision(image)
    try:
        loop = asyncio.get_event_loop()
        analysis = await loop.run_in_executor(
            _executor,
            lambda: analyze_skin_image_with_vision(image_bytes, symptoms or ""),
        )
        return {"analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {str(e)}")


# ---------------------------------------------------------------------------
# CHATBOT API (RAG) – saves to MongoDB when user is logged in
# ---------------------------------------------------------------------------
@app.post("/chat")
async def chat(
    request: ChatRequest,
    user: dict | None = Depends(get_current_user_optional),
):
    contextual_question = request.question
    existing_doc = None

    if user and request.session_id and ObjectId.is_valid(request.session_id):
        existing_doc = await conversations_collection.find_one({
            "_id": ObjectId(request.session_id),
            "user_id": user["user_id"],
        })
        if existing_doc:
            contextual_question = _build_contextual_chat_question(
                request.question,
                list(existing_doc.get("messages", [])),
            )

    answer = ask_chatbot(contextual_question)
    out = {"answer": answer}
    now_utc = datetime.utcnow()

    if user and request.session_id and ObjectId.is_valid(request.session_id):
        doc = existing_doc
        if doc:
            new_messages = list(doc.get("messages", []))
            new_messages.append({"role": "user", "text": request.question, "created_at": now_utc})
            new_messages.append({"role": "ai", "text": answer, "created_at": now_utc})
            await conversations_collection.update_one(
                {"_id": ObjectId(request.session_id)},
                {"$set": {"messages": new_messages, "updated_at": now_utc}},
            )
            out["session_id"] = request.session_id
    elif user:
        doc = {
            "user_id": user["user_id"],
            "title": "New chat",
            "messages": [
                {"role": "user", "text": request.question, "created_at": now_utc},
                {"role": "ai", "text": answer, "created_at": now_utc},
            ],
            "updated_at": now_utc,
        }
        result = await conversations_collection.insert_one(doc)
        out["session_id"] = str(result.inserted_id)

    return out


@app.get("/chat/status")
async def chat_status():
    """Runtime readiness status for chatbot dependencies (LLM + vector store)."""
    status = get_chatbot_status()
    return {
        "ok": bool(status.get("initialized")),
        "status": status,
    }

