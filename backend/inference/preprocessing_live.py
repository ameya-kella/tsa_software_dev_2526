import numpy as np
from backend.inference.landmarks import (
    LEFT_HAND_IDXS,
    RIGHT_HAND_IDXS,
    LANDMARK_IDXS_LEFT_DOM,
    LANDMARK_IDXS_RIGHT_DOM,
)
from backend.inference.config import INPUT_SIZE

# -------------------------
# Live preprocessing
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
