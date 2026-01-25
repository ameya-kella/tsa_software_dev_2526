import numpy as np
from backend.inference.landmarks import (
    LEFT_HAND_IDXS,
    RIGHT_HAND_IDXS,
    LANDMARK_IDXS
)
from backend.inference.config import INPUT_SIZE

# -------------------------
# Live preprocessing
# -------------------------
def preprocess_live_sequence(seq):
    if len(seq) == 0:
        return None, None

    data = np.array(seq, dtype=np.float32)

    # Determine the dominant hand based on the number of valid landmarks
    left_sum = np.nansum(~np.isnan(data[:, LEFT_HAND_IDXS]), axis=(1, 2))
    right_sum = np.nansum(~np.isnan(data[:, RIGHT_HAND_IDXS]), axis=(1, 2))
    left_dom = left_sum.sum() >= right_sum.sum()

    # Use the relevant set of landmarks (87 landmarks total)
    # Now using LANDMARK_IDXS for both hands and other features
    idxs = LANDMARK_IDXS  # We no longer need to select based on the dominant hand since we're using all 87 landmarks

    hand_idxs = LEFT_HAND_IDXS if left_dom else RIGHT_HAND_IDXS

    # Find valid frames where at least one hand is detected (non-NaN)
    hand_non_nan = np.nansum(~np.isnan(data[:, hand_idxs]), axis=(1, 2))
    valid_frames = np.where(hand_non_nan > 0)[0]

    if len(valid_frames) == 0:
        return None, None

    # Select only the valid frames and the relevant 87 landmarks (using idxs)
    data = data[valid_frames][:, idxs]  # This uses the relevant 87 landmarks
    frame_idxs = valid_frames.astype(np.float32)
    frame_idxs -= frame_idxs.min()  # Normalize the frame indices

    # Pad the sequence to ensure it has exactly INPUT_SIZE frames
    if len(data) < INPUT_SIZE:
        pad = INPUT_SIZE - len(data)
        data = np.pad(data, ((0, pad), (0, 0), (0, 0)))  # Padding frames
        frame_idxs = np.pad(frame_idxs, (0, pad), constant_values=-1)  # Padding frame indices
    else:
        # Select frames from the sequence to match the INPUT_SIZE
        sel = np.linspace(0, len(data) - 1, INPUT_SIZE).astype(int)
        data = data[sel]
        frame_idxs = frame_idxs[sel]

    # Replace NaNs with zeros so the model can ignore them
    data = np.nan_to_num(data)

    # Ensure data shape matches (1, INPUT_SIZE, N_ROWS, 3)
    return data[None, ...], frame_idxs[None, ...]
