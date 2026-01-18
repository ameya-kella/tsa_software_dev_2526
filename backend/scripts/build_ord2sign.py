import pandas as pd
import json
from pathlib import Path

# Paths
ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "extended_train.csv"
OUT_PATH = ROOT / "data" / "ord2sign.json"

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# Load CSV
train = pd.read_csv(CSV_PATH)
train["sign_ord"] = train["sign"].astype("category").cat.codes

ord2sign = (
    train[["sign_ord", "sign"]]
    .drop_duplicates()
    .set_index("sign_ord")["sign"]
    .to_dict()
)

# Save JSON
with open(OUT_PATH, "w") as f:
    json.dump(ord2sign, f, indent=2)

print(f"Saved ord2sign mapping to {OUT_PATH}")
