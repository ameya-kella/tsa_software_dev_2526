# -------------------------
# Predictor
# -------------------------
import time
import numpy as np
import tensorflow as tf

from backend.inference.preprocessing_live import preprocess_live_sequence
from backend.inference.config import INPUT_SIZE

class LiveASLPredictor:
    def __init__(self, tflite_path, ord2sign, pred_interval=2.5, motion_threshold=0.015):
        """
        tflite_path: path to your TFLite model
        ord2sign: dict mapping indices to sign names
        pred_interval: seconds between predictions
        motion_threshold: minimal mean landmark change to consider frame "active"
        """
        # Load the model and allocate tensors
        self.interpreter = tf.lite.Interpreter(model_path=tflite_path)
        self.interpreter.allocate_tensors()

        # Get input and output details for the TFLite model
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

        # Ord to sign mapping
        self.ord2sign = ord2sign
        self.pred_interval = pred_interval
        self.motion_threshold = motion_threshold

        # Initialize variables for real-time processing
        self.sequence = []
        self.last_pred_time = time.time()
        self.current_sign = "—"
        self.last_landmarks = None  # for motion detection

    def update(self, frame_landmarks):
        """
        frame_landmarks: (555, 3) np.ndarray for the current frame
        """

        # Skip if frame is entirely empty
        if np.isnan(frame_landmarks).all():
            return self.current_sign, None, None

        # ----------------------------------
        # Motion check (NON-DESTRUCTIVE)
        # ----------------------------------
        do_predict = True
        if self.last_landmarks is not None:
            motion = np.nanmean(np.abs(frame_landmarks - self.last_landmarks))
            do_predict = motion >= self.motion_threshold

        self.last_landmarks = frame_landmarks.copy()

        # ----------------------------------
        # Sliding window buffer (NO RESET)
        # ----------------------------------
        self.sequence.append(frame_landmarks)

        if len(self.sequence) > INPUT_SIZE:
            self.sequence.pop(0)

        # Not enough data yet
        if len(self.sequence) < 4:
            return self.current_sign, None, None

        # ----------------------------------
        # Optional time gate (soft)
        # ----------------------------------
        if not do_predict and (time.time() - self.last_pred_time < self.pred_interval):
            return self.current_sign, None, None

        self.last_pred_time = time.time()

        # ----------------------------------
        # Preprocess (training-equivalent)
        # ----------------------------------
        frames, idxs = preprocess_live_sequence(self.sequence)

        if frames is None:
            return self.current_sign, None, None

        # ----------------------------------
        # TFLite inference (SAFE input binding)
        # ----------------------------------
        for d in self.input_details:
            name = d["name"]
            if "frames" in name:
                self.interpreter.set_tensor(d["index"], frames.astype(np.float32))
            elif "non_empty_frame_idxs" in name:
                self.interpreter.set_tensor(d["index"], idxs.astype(np.float32))

        self.interpreter.invoke()

        probs = self.interpreter.get_tensor(self.output_details[0]["index"])[0]

        # ----------------------------------
        # Prediction
        # ----------------------------------
        top_idx = int(np.argmax(probs))
        top_conf = float(probs[top_idx])
        self.current_sign = self.ord2sign.get(top_idx, "—")

        top5_idx = probs.argsort()[-5:][::-1]
        top5 = [(self.ord2sign.get(int(i), "—"), float(probs[i])) for i in top5_idx]

        print(f"\nPredicted: {self.current_sign} ({top_conf:.2f})")
        for s, c in top5:
            print(f"  {s:20s} {c:.2f}")

        return self.current_sign, top_conf, top5
