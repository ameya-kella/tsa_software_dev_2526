import numpy as np

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

def process_landmarks(rgb, face_mesh, hands, pose):
    return (
        face_mesh.process(rgb),
        hands.process(rgb),
        pose.process(rgb),
    )

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
