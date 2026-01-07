import os
import cv2
import numpy as np
import pandas as pd
import mediapipe as mp
import sys
from datetime import datetime

# --------------------- Project Paths ---------------------
PROJECT_DIR = r"C:\Users\ameya\Documents\Projects\tsa_software_dev_2526"
RAW_VIDEOS_DIR = os.path.join(PROJECT_DIR, "raw_videos")
LANDMARKS_DIR = os.path.join(PROJECT_DIR, "npy_landmarks")
CSV_PATH = os.path.join(PROJECT_DIR, "train_data_map.csv")
LOG_PATH = os.path.join(PROJECT_DIR, "output_landmarks_log.txt")

FPS_TARGET = 15  # target output fps
os.makedirs(LANDMARKS_DIR, exist_ok=True)

# --------------------- Logging (console + file) ---------------------
class Tee(object):
    def __init__(self, *files):
        self.files = files
    def write(self, data):
        if data.strip() != "":
            timestamp = datetime.now().strftime("[%Y-%m-%d %H:%M:%S] ")
            data_with_time = timestamp + data
            for f in self.files:
                f.write(data_with_time)
                f.flush()
    def flush(self):
        for f in self.files:
            f.flush()

with open(LOG_PATH, "a", encoding="utf-8") as log_file:
    sys.stdout = Tee(sys.stdout, log_file)
    sys.stderr = Tee(sys.stderr, log_file)

    print("\n\n==============================")
    print("LANDMARK EXTRACTION STARTED")
    print("==============================\n")

    # --------------------- Mediapipe Holistic Setup ---------------------
    mp_holistic = mp.solutions.holistic
    holistic = mp_holistic.Holistic(
        static_image_mode=False,
        model_complexity=2,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    # --------------------- Landmark extraction ---------------------
    def extract_landmarks_from_frame(frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = holistic.process(rgb)

        pose = np.array([[lm.x, lm.y, lm.z, lm.visibility] for lm in results.pose_landmarks.landmark]) if results.pose_landmarks else np.zeros((33, 4), dtype=np.float32)
        lh = np.array([[lm.x, lm.y, lm.z, lm.visibility] for lm in results.left_hand_landmarks.landmark]) if results.left_hand_landmarks else np.zeros((21, 4), dtype=np.float32)
        rh = np.array([[lm.x, lm.y, lm.z, lm.visibility] for lm in results.right_hand_landmarks.landmark]) if results.right_hand_landmarks else np.zeros((21, 4), dtype=np.float32)
        face = np.array([[lm.x, lm.y, lm.z, lm.visibility] for lm in results.face_landmarks.landmark]) if results.face_landmarks else np.zeros((468, 4), dtype=np.float32)

        return np.concatenate([pose, lh, rh, face], axis=0)

    # --------------------- Load CSV ---------------------
    df = pd.read_csv(CSV_PATH)

    # --------------------- Main Loop ---------------------
    for idx, row in df.iterrows():
        try:
            video_name = row["SENTENCE_NAME"]
            video_path = os.path.join(RAW_VIDEOS_DIR, f"{video_name}.mp4")
            output_path = os.path.join(LANDMARKS_DIR, f"{video_name}.npy")

            if os.path.exists(output_path):
                print(f"⏩ Skipping clip {idx} — already exists: {output_path}")
                continue

            print(f"\n▶ Processing clip {idx}")
            print(f"Video path: {video_path}")

            if not os.path.exists(video_path):
                print("❌ ERROR: video missing — skipping")
                print("----------------------------------------")
                continue

            cap = cv2.VideoCapture(video_path)
            native_fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames / native_fps if native_fps > 0 else 0

            print(f"Native FPS: {native_fps}")
            print(f"Total frames: {total_frames}")
            print(f"Duration: {duration:.2f}s")

            if total_frames == 0:
                print("❌ ERROR: corrupted video — skipping")
                print("----------------------------------------")
                continue

            skip = max(int(round(native_fps / FPS_TARGET)), 1)
            print(f"Downsampling: using every {skip}-th frame")

            landmarks_list = []
            frames_read = 0
            frames_used = 0
            frames_with_landmarks = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frames_read += 1

                if frames_read % skip != 0:
                    continue

                frames_used += 1
                lm = extract_landmarks_from_frame(frame)

                if lm.sum() > 0:
                    frames_with_landmarks += 1

                landmarks_list.append(lm)

            cap.release()

            landmarks = np.array(landmarks_list)

            print(f"Frames read: {frames_read}")
            print(f"Frames retained: {frames_used}")
            print(f"Frames w/ at least some landmarks: {frames_with_landmarks}")
            print(f"Final shape: {landmarks.shape}")

            if landmarks.shape[0] == 0:
                print("⚠️ WARNING: extracted 0 frames")
            else:
                np.save(output_path, landmarks)
                print(f"✔ Saved to: {output_path}")

            print("----------------------------------------")

        except Exception as e:
            print(f"❌ ERROR processing clip {idx}: {e}")
            print("----------------------------------------")

    print("\nExtraction completed.\n")
