import os
import torch
import numpy as np
from transformers import ViTForImageClassification, ViTImageProcessor
from PIL import Image

_BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_BASE, "best_small_model")

DERMATOLOGY_LABEL_MAP = {
    # Standard LABEL_X keys
    "LABEL_0": "Melanoma",
    "LABEL_1": "Melanocytic nevus (mole)",
    "LABEL_2": "Basal cell carcinoma",
    "LABEL_3": "Actinic keratosis",
    "LABEL_4": "Benign keratosis",
    "LABEL_5": "Dermatofibroma",
    "LABEL_6": "Vascular lesion",
    "LABEL_7": "Squamous cell carcinoma",
    # Named labels from custom models
    "acne": "Acne vulgaris",
    "acne vulgaris": "Acne vulgaris",
    "eczema": "Eczema (Atopic Dermatitis)",
    "atopic dermatitis": "Eczema (Atopic Dermatitis)",
    "psoriasis": "Psoriasis",
    "rosacea": "Rosacea",
    "tinea": "Tinea (Fungal infection)",
    "ringworm": "Tinea corporis (Ringworm)",
    "lichen": "Lichen planus",
    "lichen planus": "Lichen planus",
    "lichen simplex": "Lichen simplex chronicus",
    "vitiligo": "Vitiligo",
    "urticaria": "Urticaria (Hives)",
    "seborrheic dermatitis": "Seborrheic Dermatitis",
    "contact dermatitis": "Contact Dermatitis",
    "warts": "Verruca vulgaris (Warts)",
    "molluscum": "Molluscum contagiosum",
    "scabies": "Scabies",
    "impetigo": "Impetigo",
    "cellulitis": "Cellulitis",
    "herpes": "Herpes simplex / zoster",
    "chickenpox": "Varicella (Chickenpox)",
    "normal": "Healthy skin (no significant lesion detected)",
    "unknown normal": "Healthy skin (no significant lesion detected)",
    "unknown": "Unspecified skin finding",
    "benign": "Benign skin lesion",
    "malignant": "Potentially malignant lesion — urgent review needed",
}

model = None
processor = None


def _is_valid_model_dir(path: str) -> bool:
    """A loadable HF image model directory must include config + preprocessor + weights."""
    if not os.path.isdir(path):
        return False
    has_config = os.path.isfile(os.path.join(path, "config.json"))
    has_preprocessor = os.path.isfile(os.path.join(path, "preprocessor_config.json"))
    has_weights = (
        os.path.isfile(os.path.join(path, "model.safetensors"))
        or os.path.isfile(os.path.join(path, "pytorch_model.bin"))
    )
    return has_config and has_preprocessor and has_weights


def _resolve_model_path() -> str:
    """Find the actual model directory even if files are nested under best_small_model."""
    if _is_valid_model_dir(MODEL_PATH):
        return MODEL_PATH

    for root, _dirs, _files in os.walk(MODEL_PATH):
        if _is_valid_model_dir(root):
            return root

    raise FileNotFoundError(
        "No valid model directory found under backend/best_small_model. "
        "Expected config.json + preprocessor_config.json + model.safetensors (or pytorch_model.bin)."
    )


def _skin_pixel_ratio(image: Image.Image) -> float:
    """Estimate fraction of pixels that look like skin in YCbCr space."""
    arr = np.array(image.convert("YCbCr"))
    cb = arr[:, :, 1]
    cr = arr[:, :, 2]
    # Broad thresholds commonly used in computer-vision skin masking.
    mask = (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173)
    return float(mask.mean())


def _low_saturation_ratio(image: Image.Image) -> float:
    """Large low-saturation area usually indicates skin close-ups over vivid objects."""
    arr = np.array(image.convert("HSV"))
    s = arr[:, :, 1] / 255.0
    return float((s < 0.35).mean())


def is_likely_skin_image(image: Image.Image) -> tuple[bool, dict[str, float]]:
    """
    Heuristic filter to reject obvious non-skin photos before disease prediction.
    Returns (allowed, metrics) to aid API error reporting and tuning.
    """
    skin_ratio = _skin_pixel_ratio(image)
    low_sat_ratio = _low_saturation_ratio(image)

    # Accept when skin mask is strong, or moderately present with mostly low saturation.
    allowed = (skin_ratio >= 0.08) or (skin_ratio >= 0.04 and low_sat_ratio >= 0.45)
    return allowed, {
        "skin_ratio": skin_ratio,
        "low_saturation_ratio": low_sat_ratio,
    }


def load_model():
    global model, processor
    if model is None:
        resolved_path = _resolve_model_path()
        model = ViTForImageClassification.from_pretrained(resolved_path)
        processor = ViTImageProcessor.from_pretrained(resolved_path)
        model.eval()
    return model, processor


def _to_dermatology_label(raw_label: str) -> str:
    # 1. Exact match
    if raw_label in DERMATOLOGY_LABEL_MAP:
        return DERMATOLOGY_LABEL_MAP[raw_label]
    # 2. Lowercase
    lower = raw_label.lower().strip()
    if lower in DERMATOLOGY_LABEL_MAP:
        return DERMATOLOGY_LABEL_MAP[lower]
    # 3. Normalized (underscores → spaces)
    normalized = lower.replace("_", " ")
    if normalized in DERMATOLOGY_LABEL_MAP:
        return DERMATOLOGY_LABEL_MAP[normalized]
    # 4. Partial match
    for key, value in DERMATOLOGY_LABEL_MAP.items():
        if key in normalized:
            return value
    # 5. Readable fallback
    return raw_label.replace("_", " ").title()


def predict_image(image: Image.Image, top_k: int = 3):
    model, processor = load_model()
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    logits = outputs.logits[0]
    probs = torch.softmax(logits, dim=0)
    top_probs, top_indices = torch.topk(probs, min(top_k, len(probs)))

    primary_idx = int(top_indices[0].item())
    primary_raw = model.config.id2label.get(primary_idx, f"LABEL_{primary_idx}")
    primary_label = _to_dermatology_label(primary_raw)
    primary_confidence = float(top_probs[0].item())

    differential = []
    for i in range(1, len(top_indices)):
        idx = int(top_indices[i].item())
        raw = model.config.id2label.get(idx, f"LABEL_{idx}")
        differential.append({
            "label": _to_dermatology_label(raw),
            "confidence": float(top_probs[i].item()),
        })

    return {
        "label": primary_label,
        "confidence": primary_confidence,
        "differential": differential,
    }