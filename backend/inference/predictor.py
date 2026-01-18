# -------------------------
# Predictor
# -------------------------
import time
import numpy as np
import tensorflow as tf

from backend.inference.preprocessing_live import preprocess_live_sequence

class LiveASLPredictor:
    def __init__(self, tflite_path, ord2sign, pred_interval=2.5, motion_threshold=0.015):
        """
        tflite_path: path to your TFLite model
        ord2sign: dict mapping indices to sign names
        pred_interval: seconds between predictions
        motion_threshold: minimal mean landmark change to consider frame "active"
        """
        self.interpreter = tf.lite.Interpreter(model_path=tflite_path)
        self.interpreter.allocate_tensors()
        self.pred_fn = self.interpreter.get_signature_runner("serving_default")
        self.ord2sign = ord2sign
        self.pred_interval = pred_interval
        self.motion_threshold = motion_threshold

        self.sequence = []
        self.last_pred_time = time.time()
        self.current_sign = "—"
        self.last_landmarks = None  # for motion detection

    def update(self, frame_landmarks):
        # Skip if all landmarks are NaN
        if np.isnan(frame_landmarks).all():
            return self.current_sign, None, None

        # Skip frame if minimal motion
        if self.last_landmarks is not None:
            # Average landmark motion
            motion = np.nanmean(np.abs(frame_landmarks - self.last_landmarks))
            if motion < self.motion_threshold:
                # Minimal movement -> skip prediction
                return self.current_sign, None, None
        self.last_landmarks = frame_landmarks.copy()

        # Add frame to sequence
        self.sequence.append(frame_landmarks)

        # Only run prediction if pred_interval passed
        if time.time() - self.last_pred_time < self.pred_interval:
            return self.current_sign, None, None

        # Preprocess sequence for model
        frames, idxs = preprocess_live_sequence(self.sequence)
        self.sequence.clear()
        self.last_pred_time = time.time()

        if frames is None:
            return self.current_sign, None, None

        # Run model
        sig_outputs = self.pred_fn(frames=frames, non_empty_frame_idxs=idxs)
        preds = list(sig_outputs.values())[0]

        # Convert logits to probabilities if needed
        if preds.max() > 1.0 or preds.min() < 0.0:
            probs = tf.nn.softmax(preds[0]).numpy()
        else:
            probs = preds[0]

        # Top prediction
        top_idx = probs.argmax()
        self.current_sign = self.ord2sign.get(top_idx, "—")
        top_confidence = float(probs[top_idx])

        # Top 5 predictions
        top5_idx = probs.argsort()[-5:][::-1]
        top5 = [(self.ord2sign.get(i, "—"), float(probs[i])) for i in top5_idx]

        # Print to terminal
        print(f"\nPredicted Sign: {self.current_sign} | Confidence: {top_confidence:.2f}")
        print("Top 5 predictions:")
        for sign_name, conf in top5:
            print(f"  {sign_name}: {conf:.2f}")

        return self.current_sign, top_confidence, top5
