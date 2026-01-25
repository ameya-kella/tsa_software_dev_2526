import numpy as np

LIPS_IDXS = np.array([  # The 40 face landmarks
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409,
    291, 146, 91, 181, 84, 17, 314, 405, 321, 375,
    78, 191, 80, 81, 82, 13, 312, 311, 310, 415,
    95, 88, 178, 87, 14, 317, 402, 318, 324, 308
])

LEFT_HAND_IDXS = np.array([  # 21 landmarks for left hand
    468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 
    478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 
    488
])

RIGHT_HAND_IDXS = np.array([  # 21 landmarks for right hand
    522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 
    532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 
    542
])

POSE_IDXS = np.array([502, 503, 504, 505, 506])  # 5 pose landmarks

# Now, when you combine them for the left and right dominant (87 landmarks in total)
# Both left and right hand landmarks should be included for 87
LANDMARK_IDXS = np.concatenate([LIPS_IDXS, LEFT_HAND_IDXS, RIGHT_HAND_IDXS, POSE_IDXS])  # 40 + 21 + 21 + 5 = 87 landmarks

print(len(LANDMARK_IDXS))  # This should now print 87



def process_landmarks(rgb, face_mesh, hands, pose):
    return (
        face_mesh.process(rgb),
        hands.process(rgb),
        pose.process(rgb),
    )

# -------------------------
# Landmark extraction
# -------------------------
def extract_87_landmarks(face_res, hand_res, pose_res):
    # Initialize a placeholder for 87 landmarks (x, y, z for each)
    landmarks = np.full((87, 3), np.nan, dtype=np.float32)

    # Extract face landmarks (40 landmarks)
    if face_res.multi_face_landmarks:
        for i, lm in enumerate(face_res.multi_face_landmarks[0].landmark[:40]):  # Only take first 40 landmarks for the face
            landmarks[i] = [lm.x, lm.y, lm.z]

    # Extract pose landmarks (5 landmarks)
    if pose_res.pose_landmarks:
        for i, lm in enumerate(pose_res.pose_landmarks.landmark[:5]):  # Only take first 5 landmarks for the pose
            landmarks[40 + i] = [lm.x, lm.y, lm.z]

    # Extract hand landmarks (21 for left hand and 21 for right hand)
    if hand_res.multi_hand_landmarks:
        for hand_lms, handedness in zip(hand_res.multi_hand_landmarks, hand_res.multi_handedness):
            if handedness.classification[0].label == "Left":
                for i, lm in enumerate(hand_lms.landmark):
                    landmarks[45 + i] = [lm.x, lm.y, lm.z]  # Left hand goes from index 45
            else:  # Right hand
                for i, lm in enumerate(hand_lms.landmark):
                    landmarks[66 + i] = [lm.x, lm.y, lm.z]  # Right hand goes from index 66

    return landmarks
