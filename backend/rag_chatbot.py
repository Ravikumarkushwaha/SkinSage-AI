from dotenv import load_dotenv
import os
load_dotenv()

import re
import json
import copy
from langchain_core.prompts import PromptTemplate
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_groq import ChatGroq

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FAISS_PATH = os.path.join(BASE_DIR, "vectorstore", "db_faiss")

def load_llm():
    return ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)

def load_vectorstore():
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    return FAISS.load_local(DB_FAISS_PATH, embeddings, allow_dangerous_deserialization=True)

print("Loading chatbot components...")
vector_store = None
llm = None
_init_error = None

prompt_template = PromptTemplate(
    input_variables=["context", "question"],
    template="""You are DERM Sight, an expert AI dermatologist assistant.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE MODE — choose exactly one:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MODE A — CASUAL CHAT
Use when: greeting, compliment, thanks, "what can you do", "how are you", any message with NO skin/medical content.
Return:
{{"mode": "chat", "message": "<warm friendly reply in 1-2 sentences>"}}

MODE B — INVALID IMAGE
Use ONLY when "Image analysis (from AI review):" section explicitly contains "NOT SKIN:".
Return:
{{"mode": "invalid", "message": "The uploaded image does not appear to show human skin. Please upload a clear photo of the affected skin area."}}

MODE C — DERMATOLOGY ANALYSIS
Use when: message contains "Image prediction:", "Image analysis (from AI review):", skin symptoms, or any skin/medical question.
IMPORTANT: Even if the prediction says "Healthy skin", "Normal", or "Unknown" — still use MODE C and give advice based on the patient's symptoms.
Return:
{{
  "mode": "analysis",
  "assessment": "One direct clinical sentence. If confidence is low (<50%) or label is Normal/Unknown, base assessment on symptoms described.",
  "sections": {{
    "Treatment": ["Concrete option 1", "Concrete option 2", "Concrete option 3"],
    "Risk": ["Risk factor or red flag 1", "Risk factor 2"],
    "Cost": ["Costs vary by location and insurance — confirm with your provider."],
    "Prevention": ["Tip 1", "Tip 2", "Tip 3"],
    "Next Step": ["Schedule an in-person dermatologist visit to confirm diagnosis and receive a tailored treatment plan."]
  }},
  "disclaimer": "This is for educational purposes only. A licensed dermatologist should confirm diagnosis and prescribe treatment."
}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES:
- Return ONLY valid JSON. Zero text outside the JSON.
- NEVER return mode=invalid for CNN predictions — only for vision analysis with "NOT SKIN:".
- NEVER return an empty message field.
- Use Context as primary medical source. Do not invent drug names or dosages.
- One sentence per array item max.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Context (dermatology knowledge base):
{context}

User message:
{question}

JSON only:"""
)

RETRIEVAL_K = 8
print("Chatbot ready (lazy initialization enabled)!")


def _clean_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())
    return raw.strip()


def _is_non_skin_vision_result(question: str) -> bool:
    """Blocks ONLY when Groq vision model wrote 'NOT SKIN:' in its analysis."""
    lower = question.lower()
    idx = lower.find("image analysis (from ai review):")
    if idx == -1:
        return False
    return "not skin:" in lower[idx: idx + 600]


def _is_dermatology_message(question: str) -> bool:
    lower = question.lower().strip()
    if "image prediction:" in lower or "image analysis (from ai review):" in lower:
        return True
    skin_keywords = [
        "skin", "rash", "acne", "eczema", "psoriasis", "mole", "lesion", "itch",
        "itchy", "dermat", "melanoma", "wound", "sore", "blister", "hive", "wart",
        "fungal", "infection", "inflam", "redness", "swollen", "pimple", "blackhead",
        "whitehead", "cyst", "sebaceous", "ringworm", "tinea", "scabies", "burn",
        "scar", "keloid", "patch", "plaque", "pustule", "papule", "nodule",
        "treatment", "symptom", "diagnos", "condition", "disease", "disorder",
        "cream", "ointment", "medication", "prescription", "dermatologist",
        "doctor", "consult", "clinic", "hospital", "urgent", "emergency",
        "precaution", "precautions", "prevention", "prevent", "care", "self care",
        "next step", "follow up", "follow-up", "risk", "side effect", "recur",
        "sunburn", "allerg", "atopic", "dry skin", "oily skin", "bump", "bumps",
        "spot", "spots", "mark", "marks", "blemish", "flak", "peel", "bleed",
        "dark spot", "red spot", "black spot", "white spot", "lichen",
    ]
    return any(kw in lower for kw in skin_keywords)


def _extract_condition_for_retrieval(question: str) -> str:
    m = re.search(r"Image analysis \(from AI review\):\s*([^\n.]+)", question, re.IGNORECASE)
    if m:
        return m.group(1).strip()[:200]
    m = re.search(r"Image prediction:\s*([^(]+?)\s*\(", question, re.IGNORECASE)
    if m:
        label = m.group(1).strip()
        if any(skip in label.lower() for skip in ["unknown", "normal", "healthy"]):
            # Use symptom text instead of the generic label
            rest = re.sub(r"Image prediction:[^.]+\.", "", question, flags=re.IGNORECASE).strip()
            return rest[:200] if rest else "general skin condition"
        return label
    m = re.search(r"classified as\s*[:\-]?\s*([^.?(]+)", question, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


_NON_SKIN_RESPONSE = json.dumps({
    "mode": "invalid",
    "message": "The uploaded image does not appear to show human skin or a skin condition. Please upload a clear, well-lit photo of the affected skin area."
})

_ERROR_RESPONSE = json.dumps({
    "mode": "chat",
    "message": "Sorry, I could not process your request right now. Please try again."
})

_INCONCLUSIVE_ANALYSIS = {
    "mode": "analysis",
    "assessment": "The image scan result was inconclusive. Based on your described symptoms, a dermatologist evaluation is recommended.",
    "sections": {
        "Treatment": [
            "Avoid touching or picking the affected area",
            "Apply a gentle fragrance-free moisturizer twice daily",
            "Use over-the-counter hydrocortisone 1% for mild inflammation if appropriate"
        ],
        "Risk": [
            "Persistent or worsening symptoms warrant urgent evaluation",
            "Immunocompromised individuals should seek care sooner"
        ],
        "Cost": ["Costs vary by location and insurance — confirm with your provider."],
        "Prevention": [
            "Keep the affected area clean and dry",
            "Avoid known irritants and harsh soaps",
            "Use SPF 30+ sunscreen daily on exposed skin"
        ],
        "Next Step": ["Schedule an in-person dermatologist visit to confirm diagnosis and receive a tailored treatment plan."]
    },
    "disclaimer": "This is for educational purposes only. A licensed dermatologist should confirm diagnosis and prescribe treatment."
}


def _build_fallback_analysis(condition: str = "", reason: str = "") -> str:
    """Return a conservative analysis payload when advanced model calls fail."""
    fallback = copy.deepcopy(_INCONCLUSIVE_ANALYSIS)
    if condition:
        fallback["assessment"] = (
            f"Your symptoms may be related to {condition}. "
            "The image scan result was inconclusive. Based on your described symptoms, "
            "a dermatologist evaluation is recommended."
        )
    if reason:
        fallback["confidence_note"] = reason
    return json.dumps(fallback)


def _question_focus(question: str) -> str:
    """Extract a short user-focus phrase for personalized fallback text."""
    text = re.sub(r"analysis mode preference\s*:\s*\w+\.?", "", question, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:120]


def _build_contextual_fallback_analysis(question: str, condition: str = "", reason: str = "") -> str:
    fallback = copy.deepcopy(_INCONCLUSIVE_ANALYSIS)
    focus = _question_focus(question)

    if condition:
        fallback["assessment"] = (
            f"Your symptoms may be related to {condition}. "
            "The image scan result was inconclusive. Based on your described symptoms, "
            "a dermatologist evaluation is recommended."
        )
    elif focus:
        fallback["assessment"] = (
            f"Regarding your concern ({focus}), the advanced model is temporarily unavailable. "
            "Use conservative skin care and seek dermatologist review if symptoms persist or worsen."
        )

    if reason:
        fallback["confidence_note"] = reason
    return json.dumps(fallback)


def _build_fallback_chat(reason: str = "") -> str:
    message = "Hello. I can still help with general guidance while the advanced model reconnects."
    if reason:
        message = f"{message} ({reason})"
    return json.dumps({
        "mode": "chat",
        "message": message,
    })


def _llm_error_hint(error_text: str) -> str:
    lower = error_text.lower()
    if "invalid_api_key" in lower or "invalid api key" in lower:
        return "Groq API key is invalid"
    if "missing_api_key" in lower or "api key" in lower and "missing" in lower:
        return "Groq API key is missing"
    if "rate_limit" in lower or "too many requests" in lower:
        return "LLM rate limit reached"
    return "AI model is temporarily unavailable"


def _ensure_components() -> tuple[bool, str]:
    """Lazy-init vector store and LLM so API can still run with graceful fallback."""
    global vector_store, llm, _init_error
    if vector_store is not None and llm is not None:
        return True, ""

    try:
        if vector_store is None:
            vector_store = load_vectorstore()
        if llm is None:
            llm = load_llm()
        _init_error = None
        return True, ""
    except Exception as e:
        _init_error = str(e)
        print("[Chatbot] Initialization fallback:", _init_error)
        return False, _init_error


def get_chatbot_status() -> dict:
    """Return lightweight runtime status for health/debug endpoints."""
    initialized, init_err = _ensure_components()
    return {
        "initialized": initialized,
        "vector_store_ready": vector_store is not None,
        "llm_ready": llm is not None,
        "error_hint": _llm_error_hint(init_err) if init_err else "",
    }


def ask_chatbot(question: str) -> str:
    try:
        initialized, init_err = _ensure_components()

        # Block only if vision explicitly said NOT SKIN
        if _is_non_skin_vision_result(question):
            print("[Chatbot] Vision flagged non-skin.")
            return _NON_SKIN_RESPONSE

        # Detect analysis mode preference in the incoming question (set by frontend)
        # and inject concise instructions to influence response length/depth.
        mode_match = re.search(r"analysis mode preference\s*:\s*(fast|balanced|detailed)\.?", question, flags=re.IGNORECASE)
        analysis_mode_instruction = ""
        if mode_match:
            mode_val = mode_match.group(1).lower()
            # remove the raw token from the question so the LLM doesn't see it verbatim
            question = re.sub(r"analysis mode preference\s*:\s*(fast|balanced|detailed)\.?", "", question, flags=re.IGNORECASE).strip()
            if mode_val == "fast":
                analysis_mode_instruction = (
                    "[ANALYSIS_MODE:FAST] Keep responses succinct and focused: 1-2 short sentences for assessment, "
                    "provide only the most relevant treatments or next steps. Avoid lengthy explanations."
                )
            elif mode_val == "detailed":
                analysis_mode_instruction = (
                    "[ANALYSIS_MODE:DETAILED] Provide deeper reasoning: a clear assessment sentence plus 3 detailed actionable items "
                    "for treatment, risk discussion, and prevention. Include brief rationale for choices."
                )
            else:
                analysis_mode_instruction = (
                    "[ANALYSIS_MODE:BALANCED] Provide a concise clinical assessment (1 sentence) and 2-3 practical treatment/prevention points."
                )
            # Prepend the instruction to the question so it becomes part of model input
            if analysis_mode_instruction:
                question = f"{analysis_mode_instruction}\n\n{question}"

        is_derm = _is_dermatology_message(question)
        condition = _extract_condition_for_retrieval(question)

        if is_derm and vector_store is not None:
            retrieval_query = (
                f"{condition} symptoms treatment diagnosis causes risk prevention."
                if condition else question
            )
            docs = vector_store.similarity_search(retrieval_query, k=RETRIEVAL_K)
            context = "\n\n".join(doc.page_content for doc in docs)
        elif is_derm:
            context = (
                "Vector knowledge base is currently unavailable. "
                "Provide safe, conservative dermatology guidance and recommend in-person evaluation."
            )
        else:
            context = "No dermatological context needed."

        if not initialized or llm is None:
            if is_derm:
                reason = "AI model is temporarily unavailable; this is a conservative fallback response."
                if init_err:
                    reason = f"{reason} ({_llm_error_hint(init_err)})"
                return _build_contextual_fallback_analysis(question, condition, reason)
            return _build_fallback_chat(_llm_error_hint(init_err) if init_err else "")

        prompt = prompt_template.format(context=context, question=question)
        try:
            response = llm.invoke(prompt)
        except Exception as e:
            err = str(e)
            print("[Chatbot] LLM invocation failed:", err)
            hint = _llm_error_hint(err)
            if is_derm:
                return _build_contextual_fallback_analysis(
                    question,
                    condition,
                    f"{hint}; this is a conservative fallback response.",
                )
            return _build_fallback_chat(hint)
        raw = _clean_json(response.content if hasattr(response, "content") else str(response))

        try:
            parsed = json.loads(raw)
            mode = parsed.get("mode", "")

            # Safety: LLM wrongly returned invalid for a CNN prediction → use fallback analysis
            if mode == "invalid" and "image prediction:" in question.lower():
                print("[Chatbot] LLM wrongly returned invalid for CNN prediction — using fallback.")
                return json.dumps(_INCONCLUSIVE_ANALYSIS)

            # Safety: LLM returned analysis for casual chat → downgrade to chat
            if mode == "analysis" and not is_derm:
                return json.dumps({
                    "mode": "chat",
                    "message": parsed.get("assessment", "How can I help you today?")
                })

            # Safety: empty message field → fill it
            if mode in ("chat", "invalid") and not parsed.get("message", "").strip():
                parsed["message"] = "How can I help you? Feel free to describe your skin concern or upload an image."

            return json.dumps(parsed)

        except json.JSONDecodeError:
            print("[Chatbot] Non-JSON output:", raw[:200])
            if not is_derm and raw and len(raw) < 400:
                return json.dumps({"mode": "chat", "message": raw})
            return _ERROR_RESPONSE

    except Exception as e:
        print("Chatbot Error:", e)
        hint = _llm_error_hint(str(e))
        if _is_dermatology_message(question):
            return _build_contextual_fallback_analysis(
                question,
                _extract_condition_for_retrieval(question),
                f"{hint}; this is a conservative fallback response.",
            )
        return _build_fallback_chat(hint)


def analyze_skin_image_with_vision(image_bytes: bytes, symptoms: str = "") -> str:
    import base64
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return "Image analysis unavailable (missing API key). Please describe your symptoms."
    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{b64}"
        text_prompt = (
            "You are a dermatology expert. FIRST check: does this image show human skin?\n\n"
            "If it does NOT (e.g. wall, rock, object, food, animal, landscape, furniture), respond ONLY with:\n"
            "'NOT SKIN: <one sentence describing what the image shows>.'\n\n"
            "If it DOES show human skin, provide a clinical description: "
            "lesion appearance (size, shape, color, border, texture), visible body location, "
            "and 2-3 differential diagnoses. No confidence percentages. Professional terminology only."
        )
        if symptoms and symptoms.strip():
            text_prompt += f"\n\nPatient-reported symptoms: {symptoms.strip()}"
        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": [
                {"type": "text", "text": text_prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]}],
            temperature=0.2, max_tokens=1024,
        )
        out = completion.choices[0].message.content
        return out.strip() if out else "Unable to analyze image. Please describe your symptoms."
    except Exception as e:
        print("Vision analysis error:", e)
        err = str(e).lower()
        if "invalid_api_key" in err or "invalid api key" in err:
            return "Image analysis unavailable (invalid GROQ_API_KEY). Please update backend .env and describe your symptoms."
        if "rate_limit" in err or "too many requests" in err:
            return "Image analysis is temporarily rate-limited. Please describe your symptoms and try again shortly."
        return "Image analysis could not be completed. Please describe your symptoms."