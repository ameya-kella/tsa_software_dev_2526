# =========================
# Imports
# =========================
import numpy as np
import pandas as pd
import tensorflow as tf
from tqdm import tqdm
from sklearn.model_selection import GroupShuffleSplit
import os

# =========================
# Config
# =========================
SEED = 42
PREPROCESS_DATA = True

ROWS_PER_FRAME = 543
N_ROWS = 543
N_DIMS = 3
INPUT_SIZE = 64
NUM_CLASSES = 250

# =========================
# Load metadata
# =========================
train = pd.read_csv('/kaggle/input/asl-signs/train.csv')

def get_file_path(path):
    return f'/kaggle/input/asl-signs/{path}'

train['file_path'] = train['path'].apply(get_file_path)

# Encode labels
train['sign_ord'] = train['sign'].astype('category').cat.codes

SIGN2ORD = train[['sign', 'sign_ord']].set_index('sign').squeeze().to_dict()
ORD2SIGN = train[['sign_ord', 'sign']].set_index('sign_ord').squeeze().to_dict()

N_SAMPLES = len(train)

# =========================
# Landmark indices
# =========================
LIPS_IDXS0 = np.array([
    61,185,40,39,37,0,267,269,270,409,
    291,146,91,181,84,17,314,405,321,375,
    78,191,80,81,82,13,312,311,310,415,
    95,88,178,87,14,317,402,318,324,308
])

LEFT_HAND_IDXS0 = np.arange(468,489)
RIGHT_HAND_IDXS0 = np.arange(522,543)
LEFT_POSE_IDXS0 = np.array([502,504,506,508,510])
RIGHT_POSE_IDXS0 = np.array([503,505,507,509,511])

LANDMARK_IDXS_LEFT_DOMINANT0 = np.concatenate(
    (LIPS_IDXS0, LEFT_HAND_IDXS0, LEFT_POSE_IDXS0)
)
LANDMARK_IDXS_RIGHT_DOMINANT0 = np.concatenate(
    (LIPS_IDXS0, RIGHT_HAND_IDXS0, RIGHT_POSE_IDXS0)
)

N_COLS = LANDMARK_IDXS_LEFT_DOMINANT0.size

# =========================
# Load raw parquet data
# =========================
def load_relevant_data_subset(pq_path):
    data = pd.read_parquet(pq_path, columns=['x', 'y', 'z'])
    n_frames = int(len(data) / ROWS_PER_FRAME)
    data = data.values.reshape(n_frames, ROWS_PER_FRAME, 3)
    return data.astype(np.float32)

# =========================
# Preprocessing Layer
# =========================
class PreprocessLayer(tf.keras.layers.Layer):
    def __init__(self):
        super().__init__()

    def pad_edge(self, t, repeats, side):
        if side == 'LEFT':
            return tf.concat((tf.repeat(t[:1], repeats, axis=0), t), axis=0)
        else:
            return tf.concat((t, tf.repeat(t[-1:], repeats, axis=0)), axis=0)

    @tf.function(
        input_signature=(tf.TensorSpec(shape=[None, N_ROWS, N_DIMS], dtype=tf.float32),)
    )
    def call(self, data0):
        left_sum = tf.reduce_sum(
            tf.where(tf.math.is_nan(tf.gather(data0, LEFT_HAND_IDXS0, axis=1)), 0, 1)
        )
        right_sum = tf.reduce_sum(
            tf.where(tf.math.is_nan(tf.gather(data0, RIGHT_HAND_IDXS0, axis=1)), 0, 1)
        )

        left_dominant = left_sum >= right_sum

        if left_dominant:
            hand_idxs = LEFT_HAND_IDXS0
            landmark_idxs = LANDMARK_IDXS_LEFT_DOMINANT0
        else:
            hand_idxs = RIGHT_HAND_IDXS0
            landmark_idxs = LANDMARK_IDXS_RIGHT_DOMINANT0

        hand_non_nan = tf.reduce_sum(
            tf.where(tf.math.is_nan(tf.gather(data0, hand_idxs, axis=1)), 0, 1),
            axis=[1,2]
        )

        frame_idxs = tf.where(hand_non_nan > 0)
        frame_idxs = tf.squeeze(frame_idxs, axis=1)
        data = tf.gather(data0, frame_idxs, axis=0)

        frame_idxs = tf.cast(frame_idxs, tf.float32)
        frame_idxs -= tf.reduce_min(frame_idxs)

        data = tf.gather(data, landmark_idxs, axis=1)

        n_frames = tf.shape(data)[0]

        if n_frames < INPUT_SIZE:
            pad = INPUT_SIZE - n_frames
            data = tf.pad(data, [[0,pad],[0,0],[0,0]])
            frame_idxs = tf.pad(frame_idxs, [[0,pad]], constant_values=-1)
        else:
            idxs = tf.cast(
                tf.linspace(0.0, tf.cast(n_frames-1, tf.float32), INPUT_SIZE),
                tf.int32
            )
            data = tf.gather(data, idxs)
            frame_idxs = tf.gather(frame_idxs, idxs)

        data = tf.where(tf.math.is_nan(data), 0.0, data)
        return data, frame_idxs

preprocess_layer = PreprocessLayer()

# =========================
# Wrapper
# =========================
def get_data(file_path):
    data = load_relevant_data_subset(file_path)
    return preprocess_layer(data)

# =========================
# Create & save dataset
# =========================
def preprocess_data():
    X = np.zeros((N_SAMPLES, INPUT_SIZE, N_COLS, N_DIMS), np.float32)
    y = np.zeros((N_SAMPLES,), np.int32)
    NON_EMPTY_FRAME_IDXS = np.full((N_SAMPLES, INPUT_SIZE), -1, np.float32)

    for i, (fp, label) in enumerate(tqdm(train[['file_path', 'sign_ord']].values)):
        data, idxs = get_data(fp)
        X[i] = data
        y[i] = label
        NON_EMPTY_FRAME_IDXS[i] = idxs

    np.save('X.npy', X)
    np.save('y.npy', y)
    np.save('NON_EMPTY_FRAME_IDXS.npy', NON_EMPTY_FRAME_IDXS)

    splitter = GroupShuffleSplit(test_size=0.1, random_state=SEED)
    groups = train['participant_id'].values
    train_idx, val_idx = next(splitter.split(X, y, groups))

    np.save('X_train.npy', X[train_idx])
    np.save('y_train.npy', y[train_idx])
    np.save('NON_EMPTY_FRAME_IDXS_TRAIN.npy', NON_EMPTY_FRAME_IDXS[train_idx])

    np.save('X_val.npy', X[val_idx])
    np.save('y_val.npy', y[val_idx])
    np.save('NON_EMPTY_FRAME_IDXS_VAL.npy', NON_EMPTY_FRAME_IDXS[val_idx])

    print("Preprocessing complete.")

# =========================
# Run
# =========================
if PREPROCESS_DATA:
    preprocess_data()
