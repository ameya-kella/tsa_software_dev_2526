import cv2
import mediapipe as mp
import numpy as np
import time
import tensorflow as tf
import pandas as pd
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch

# -------------------------
# Load Flan-T5 model (large for better performance)
# -------------------------
tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-large", local_files_only=True)
model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-large", local_files_only=True)

def generate_sentence_from_words(recognized_words):
    if not recognized_words:
        return "Waiting for input..."
    
    # Remove any "TV" words if present
    words = [w for w in recognized_words if w != "TV"]
    input_text = f"""
            Objective:
            You have developed an isolated American Sign Language (ASL) word recognition model. At the end of each run, the model stores the recognized words in a list. However, the words may not necessarily be in the correct order. Your objective is to utilize these recognized words to construct a coherent and meaningful English sentence. The resulting sentence should be as simple as possible while still accurately conveying the intended meaning.

            Instructions:

            - Input: You will be provided with a Python list containing the recognized ASL words from your model. The contents of this list may vary depending on the output of your model.
            - Processing: Rearrange the words in the list to form a grammatically correct and logically valid English sentence. Take into consideration the context and logical flow of the sentence. Always ignore the word "TV".
            - Output: Generate a concise English sentence that accurately conveys the meaning of the recognized ASL words.

            Considerations:

            - Simplicity: Aim for simplicity in your sentence structure and vocabulary.
            - Clarity: Ensure that the sentence is clear and understandable.
            - Relevance: The sentence should reflect the meaning conveyed by the ASL words.
            - Grammar: Maintain proper grammar, syntax, and punctuation in the sentence. Default to present tense unless other hints are given.

            Example:

            Input: recognized_words = grandpa ride boat tomorrow
            output: Grandpa will ride the boat tomorrow.

            Here is the actual input for which you have to produce the relevant output: {" ".join(words)}
            """
    
    inputs = tokenizer(input_text, return_tensors="pt")
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=50)
    sentence = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return sentence

# -------------------------
# MediaPipe setup
# -------------------------

mp_drawing = mp.solutions.drawing_utils
mp_face_mesh = mp.solutions.face_mesh
mp_hands = mp.solutions.hands
mp_pose = mp.solutions.pose

# -------------------------
# UI constants
# -------------------------

UI_BG_COLOR = (20, 20, 20)
TEXT_COLOR = (255, 255, 255)
ACCENT_COLOR = (0, 200, 255)

FONT = cv2.FONT_HERSHEY_SIMPLEX
FONT_SCALE_LARGE = 1.2
FONT_SCALE_MED = 0.8
FONT_SCALE_SMALL = 0.6
THICKNESS = 2

# -------------------------
# Load label mapping
# -------------------------

train = pd.read_csv("extended_train.csv")
train["sign_ord"] = train["sign"].astype("category").cat.codes
ORD2SIGN = train[["sign_ord", "sign"]].set_index("sign_ord").squeeze().to_dict()

# -------------------------
# Constants (MATCH TRAINING)
# -------------------------

ROWS_PER_FRAME = 543
N_DIMS = 3
INPUT_SIZE = 64

LIPS_IDXS = np.array([
    61,185,40,39,37,0,267,269,270,409,
    291,146,91,181,84,17,314,405,321,375,
    78,191,80,81,82,13,312,311,310,415,
    95,88,178,87,14,317,402,318,324,308
])

LEFT_HAND_IDXS = np.arange(468, 489)
RIGHT_HAND_IDXS = np.arange(522, 543)

LEFT_POSE_IDXS = np.array([502,504,506,508,510])
RIGHT_POSE_IDXS = np.array([503,505,507,509,511])

LANDMARK_IDXS_LEFT_DOM = np.concatenate((LIPS_IDXS, LEFT_HAND_IDXS, LEFT_POSE_IDXS))
LANDMARK_IDXS_RIGHT_DOM = np.concatenate((LIPS_IDXS, RIGHT_HAND_IDXS, RIGHT_POSE_IDXS))

# -------------------------
# Frame utilities
# -------------------------

def read_frame(cap):
    ret, frame = cap.read()
    if not ret:
        return None, None
    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return frame, rgb


def process_landmarks(rgb, face_mesh, hands, pose):
    return (
        face_mesh.process(rgb),
        hands.process(rgb),
        pose.process(rgb),
    )

# -------------------------
# Drawing functions
# -------------------------

def draw_face_landmarks(frame, face_results):
    if not face_results.multi_face_landmarks:
        return
    for landmarks in face_results.multi_face_landmarks:
        mp_drawing.draw_landmarks(
            frame,
            landmarks,
            mp_face_mesh.FACEMESH_TESSELATION,
            mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=1),
            mp_drawing.DrawingSpec(color=(255, 0, 0), thickness=1),
        )


def draw_hand_landmarks(frame, hand_results):
    if not hand_results.multi_hand_landmarks:
        return
    for lm, handedness in zip(
        hand_results.multi_hand_landmarks,
        hand_results.multi_handedness
    ):
        label = handedness.classification[0].label
        color = (0, 0, 255) if label == "Right" else (255, 0, 0)
        mp_drawing.draw_landmarks(
            frame,
            lm,
            mp_hands.HAND_CONNECTIONS,
            mp_drawing.DrawingSpec(color=color, thickness=2),
            mp_drawing.DrawingSpec(color=color, thickness=2),
        )


def draw_pose_landmarks(frame, pose_results):
    if not pose_results.pose_landmarks:
        return
    mp_drawing.draw_landmarks(
        frame,
        pose_results.pose_landmarks,
        mp_pose.POSE_CONNECTIONS,
        mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=3),
        mp_drawing.DrawingSpec(color=(255, 255, 255), thickness=2),
    )

# -------------------------
# UI helpers
# -------------------------

def create_ui_canvas(camera_frame, panel_width=500):
    h, w, _ = camera_frame.shape
    canvas = np.zeros((h, w + panel_width, 3), dtype=np.uint8)
    canvas[:] = UI_BG_COLOR
    canvas[:, :w] = camera_frame
    return canvas


def draw_side_panel(canvas, cam_width, elapsed_time,
                    current_sign="—", recognized_words=None,
                    generated_sentence="Waiting for input..."):

    if recognized_words is None:
        recognized_words = []

    x = cam_width + 30
    y = 50
    line = 40

    cv2.putText(canvas, "ASL Recognition", (x, y),
                FONT, FONT_SCALE_LARGE, ACCENT_COLOR, THICKNESS)

    y += line * 2
    cv2.putText(canvas, "Current Sign", (x, y),
                FONT, FONT_SCALE_MED, TEXT_COLOR, 1)
    y += line
    cv2.putText(canvas, current_sign, (x, y),
                FONT, FONT_SCALE_LARGE, (0, 255, 0), THICKNESS)

    y += line * 2
    cv2.putText(canvas, f"Time: {elapsed_time}s", (x, y),
                FONT, FONT_SCALE_MED, (0, 0, 255), 2)

    y += line * 2
    cv2.putText(canvas, "Recognized Words", (x, y),
                FONT, FONT_SCALE_MED, TEXT_COLOR, 1)
    y += line

    for word in recognized_words[-6:]:
        cv2.putText(canvas, f"- {word}", (x, y),
                    FONT, FONT_SCALE_SMALL, (200, 200, 200), 1)
        y += 28

    y += line
    cv2.putText(canvas, "Generated Sentence", (x, y),
                FONT, FONT_SCALE_MED, TEXT_COLOR, 1)
    y += line
    cv2.putText(canvas, generated_sentence, (x, y),
                FONT, FONT_SCALE_SMALL, (255, 255, 0), 2)

# -------------------------
# Landmark extraction
# -------------------------

def extract_543_landmarks(face_res, hand_res, pose_res):
    landmarks = np.full((543, 3), np.nan, dtype=np.float32)

    if face_res.multi_face_landmarks:
        for i, lm in enumerate(face_res.multi_face_landmarks[0].landmark):
            landmarks[i] = [lm.x, lm.y, lm.z]

    if pose_res.pose_landmarks:
        for i, lm in enumerate(pose_res.pose_landmarks.landmark[:10]):
            landmarks[502 + i] = [lm.x, lm.y, lm.z]

    if hand_res.multi_hand_landmarks:
        for hand_lms, handedness in zip(
            hand_res.multi_hand_landmarks,
            hand_res.multi_handedness
        ):
            if handedness.classification[0].label == "Left":
                for i, lm in enumerate(hand_lms.landmark):
                    landmarks[468 + i] = [lm.x, lm.y, lm.z]
            else:
                for i, lm in enumerate(hand_lms.landmark):
                    landmarks[522 + i] = [lm.x, lm.y, lm.z]

    return landmarks

# -------------------------
# Live preprocessing (MANDATORY)
# -------------------------

def preprocess_live_sequence(seq):
    if len(seq) == 0:
        return None, None

    data = np.array(seq, dtype=np.float32)

    left_sum = np.nansum(~np.isnan(data[:, LEFT_HAND_IDXS]), axis=(1,2))
    right_sum = np.nansum(~np.isnan(data[:, RIGHT_HAND_IDXS]), axis=(1,2))
    left_dom = left_sum.sum() >= right_sum.sum()

    idxs = LANDMARK_IDXS_LEFT_DOM if left_dom else LANDMARK_IDXS_RIGHT_DOM
    hand_idxs = LEFT_HAND_IDXS if left_dom else RIGHT_HAND_IDXS

    hand_non_nan = np.nansum(~np.isnan(data[:, hand_idxs]), axis=(1,2))
    valid_frames = np.where(hand_non_nan > 0)[0]

    if len(valid_frames) == 0:
        return None, None

    data = data[valid_frames][:, idxs]
    frame_idxs = valid_frames.astype(np.float32)
    frame_idxs -= frame_idxs.min()

    if len(data) < INPUT_SIZE:
        pad = INPUT_SIZE - len(data)
        data = np.pad(data, ((0,pad),(0,0),(0,0)))
        frame_idxs = np.pad(frame_idxs, (0,pad), constant_values=-1)
    else:
        sel = np.linspace(0, len(data)-1, INPUT_SIZE).astype(int)
        data = data[sel]
        frame_idxs = frame_idxs[sel]

    data = np.nan_to_num(data)
    return data[None, ...], frame_idxs[None, ...]

# -------------------------
# Predictor
# -------------------------
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
        top_confidence = probs[top_idx]

        # Top 5 predictions
        top5_idx = probs.argsort()[-5:][::-1]
        top5 = [(self.ord2sign.get(i, "—"), probs[i]) for i in top5_idx]

        # Print to terminal
        print(f"\nPredicted Sign: {self.current_sign} | Confidence: {top_confidence:.2f}")
        print("Top 5 predictions:")
        for sign_name, conf in top5:
            print(f"  {sign_name}: {conf:.2f}")

        return self.current_sign, top_confidence, top5

# -------------------------
# Main
# -------------------------
def main():
    cap = cv2.VideoCapture(0)
    start_time = time.time()
    recognized_words = []
    generated_sentence = "Waiting for input..."

    predictor = LiveASLPredictor("signsense_pathA.tflite", ORD2SIGN)

    with mp_face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True) as face_mesh, \
         mp_hands.Hands() as hands, \
         mp_pose.Pose() as pose:

        while True:
            frame, rgb = read_frame(cap)
            if frame is None:
                break

            # Process landmarks
            face_res, hand_res, pose_res = process_landmarks(rgb, face_mesh, hands, pose)

            # Draw landmarks
            draw_face_landmarks(frame, face_res)
            draw_hand_landmarks(frame, hand_res)
            draw_pose_landmarks(frame, pose_res)

            # Predict current sign
            landmarks = extract_543_landmarks(face_res, hand_res, pose_res)
            sign, confidence, top5 = predictor.update(landmarks)


            # Update recognized words
            if confidence is not None:
                if sign not in ("—", "TV") and (not recognized_words or sign != recognized_words[-1]):
                    recognized_words.append(sign)

            # Draw UI
            ui = create_ui_canvas(frame)
            draw_side_panel(ui, frame.shape[1],
                            int(time.time() - start_time),
                            sign, recognized_words,
                            generated_sentence=generated_sentence)

            cv2.imshow("ASL UI Prototype", ui)

            # Key handling
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("s"):
                # Generate sentence on 's' key press
                if recognized_words:
                    generated_sentence = generate_sentence_from_words(recognized_words)
                    print(generated_sentence)
                    recognized_words.clear()

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
