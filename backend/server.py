# backend/server.py
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

from backend.inference.predictor import LiveASLPredictor
from backend.inference.sentence import generate_sentence_from_words
from backend.inference.config import TFLITE_MODEL_PATH, ORD2SIGN
import whisper
import uuid
import subprocess
from fastapi import UploadFile, File
import os
import tempfile

whisper_model = whisper.load_model("base")

# -------------------------
# FastAPI setup
# -------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# Predictor instance
# -------------------------
predictor = LiveASLPredictor(TFLITE_MODEL_PATH, ORD2SIGN)
recognized_words = []

# -------------------------
# Helper to append new sign if valid
# -------------------------
def append_word(sign, confidence):
    if confidence is not None and sign not in ("—", "TV"):
        if not recognized_words or sign != recognized_words[-1]:
            recognized_words.append(sign)

# -------------------------
# WebSocket endpoint
# -------------------------
@app.websocket("/ws")
# -------------------------
# WebSocket endpoint
# -------------------------
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print("WebSocket connected")
    
    while True:
        try:
            data = await ws.receive_json()
            
            # Get landmarks sent from frontend (543 x 3)
            landmarks = np.array(data.get("landmarks", []), dtype=np.float32)
            if landmarks.size == 0:
                continue  # skip empty frames
            
            # -------------------------
            # Update predictor and live words
            # -------------------------
            sign, confidence, top5 = predictor.update(landmarks)
            append_word(sign, confidence)

            # -------------------------
            # Check if client wants to generate sentence
            # -------------------------
            generate_sentence_flag = data.get("generate_sentence", False)
            sentence = ""
            if generate_sentence_flag and recognized_words:
                sentence = generate_sentence_from_words(recognized_words)
                recognized_words.clear()

            # -------------------------
            # Convert numpy types to native Python types for JSON serialization
            # -------------------------
            # Ensure confidence and sign are converted to native Python types
            if isinstance(confidence, np.generic):  # Check if it's a numpy type
                confidence = float(confidence) if confidence is not None else None  # Convert to native Python float
            
            if isinstance(sign, np.generic):  # Check if sign is a numpy type
                sign = str(sign)  # Convert to native Python string

            # Convert top5 to fully JSON-serializable structure
            if top5 is not None:
                top5 = [
                    {
                        "sign": sign,
                        "confidence": float(conf)
                    }
                    for sign, conf in top5
                ]


            # -------------------------
            # Send back current state
            # -------------------------
            await ws.send_json({
                "current_sign": sign,
                "confidence": confidence,
                "top5": top5,
                "recognized_words": recognized_words,
                "generated_sentence": sentence
            })

        except Exception as e:
            print("WebSocket disconnected:", e)
            break

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    uid = str(uuid.uuid4())

    # Use a temporary directory that works cross-platform
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, f"{uid}.webm")
        wav_path = os.path.join(tmpdir, f"{uid}.wav")

        # Save uploaded audio
        with open(input_path, "wb") as f:
            f.write(await file.read())

        # Convert to WAV for Whisper
        subprocess.run([
            "ffmpeg", "-y",
            "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            wav_path
        ], check=True)

        # Transcribe
        result = whisper_model.transcribe(wav_path, language="en")

    return {
        "text": result["text"]
    }
