import json
from pathlib import Path

# Resolve paths relative to this file
BASE_DIR = Path(__file__).resolve().parents[1]

# -------------------------
# Paths
# -------------------------

ORD2SIGN_PATH = BASE_DIR / "data" / "ord2sign.json"
TFLITE_MODEL_PATH = str(BASE_DIR / "models" / "asl_to_text_model.tflite")

# -------------------------
# Constants (MATCH TRAINING)
# -------------------------

ROWS_PER_FRAME = 543
INPUT_SIZE = 64

# -------------------------
# Load ord2sign mapping
# -------------------------

with open(ORD2SIGN_PATH, "r") as f:
    ORD2SIGN = {int(k): v for k, v in json.load(f).items()}
