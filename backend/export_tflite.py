# export_tflite.py
import tensorflow as tf

from train_model import (
    get_model,
    INPUT_SIZE,
    N_ROWS,
    N_DIMS,
)

print("Building model...")
model = get_model()

# Build variables
model(
    {
        "frames": tf.zeros([1, INPUT_SIZE, N_ROWS, N_DIMS], tf.float32),
        "non_empty_frame_idxs": tf.zeros([1, INPUT_SIZE], tf.float32),
    }
)

print("Loading weights...")
model.load_weights("signsense_pathA.weights.h5")
print("✅ Weights loaded")

print("Converting to TFLite...")
converter = tf.lite.TFLiteConverter.from_keras_model(model)

# (optional but recommended)
converter.optimizations = [tf.lite.Optimize.DEFAULT]

tflite_model = converter.convert()

with open("signsense_pathA.tflite", "wb") as f:
    f.write(tflite_model)

print("✅ TFLite export complete: signsense_pathA.tflite")
