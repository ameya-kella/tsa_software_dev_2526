# train_model.py

import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
import os

# ----------------------------
# Hyperparameters
# ----------------------------
INPUT_SIZE = 64
N_ROWS = 66  # number of landmarks
N_DIMS = 3   # x, y, z
NUM_CLASSES = 250
BATCH_SIZE = 64
N_EPOCHS = 50
LR_MAX = 1e-3
WD_RATIO = 0.05
VERBOSE = 1

# ----------------------------
# Checkpoints & Early Stopping
# ----------------------------
CHECKPOINT_DIR = "checkpoints"
BEST_WEIGHTS_PATH = os.path.join(CHECKPOINT_DIR, "best.weights.h5")
LAST_WEIGHTS_PATH = os.path.join(CHECKPOINT_DIR, "last.weights.h5")

PATIENCE = 7
os.makedirs(CHECKPOINT_DIR, exist_ok=True)

# ----------------------------
# Load data
# ----------------------------
X = np.load("X.npy").astype(np.float32)  # (samples, 64, 66, 3)
y = np.load("y.npy").astype(np.int32)    # (samples,)
non_empty_frame_idxs = np.load("NON_EMPTY_FRAME_IDXS.npy").astype(np.float32)  # (samples, 64)

# Split train/validation
X_train, X_val, y_train, y_val, idx_train, idx_val = train_test_split(
    X, y, non_empty_frame_idxs, test_size=0.1, random_state=42, stratify=y
)

print(f"Train shape: {X_train.shape}, Validation shape: {X_val.shape}")

# ----------------------------
# Data pipeline
# ----------------------------
train_dataset = tf.data.Dataset.from_tensor_slices(
    ({"frames": X_train, "non_empty_frame_idxs": idx_train}, y_train)
).shuffle(2048).batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)

val_dataset = tf.data.Dataset.from_tensor_slices(
    ({"frames": X_val, "non_empty_frame_idxs": idx_val}, y_val)
).batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)

# ----------------------------
# Model definition (SignSense architecture)
# ----------------------------
LAYER_NORM_EPS = 1e-6
UNITS = 512
NUM_BLOCKS = 2
MLP_RATIO = 2
EMBEDDING_DROPOUT = 0.0
MLP_DROPOUT_RATIO = 0.3
CLASSIFIER_DROPOUT_RATIO = 0.1

GELU = tf.keras.activations.gelu
INIT_HE_UNIFORM = tf.keras.initializers.he_uniform
INIT_GLOROT_UNIFORM = tf.keras.initializers.glorot_uniform
INIT_ZEROS = tf.keras.initializers.Constant(0.0)

# ----------------------------
# Transformer and Embedding Layers
# ----------------------------
def scaled_dot_product(q, k, v, softmax, attention_mask):
    qkt = tf.matmul(q, k, transpose_b=True)
    dk = tf.math.sqrt(tf.cast(q.shape[-1], tf.float32))
    scaled_qkt = qkt / dk
    z = tf.matmul(softmax(scaled_qkt, mask=attention_mask), v)
    return z

class MultiHeadAttention(tf.keras.layers.Layer):
    def __init__(self, d_model, num_heads):
        super().__init__()
        self.d_model = d_model
        self.num_heads = num_heads
        self.depth = d_model // num_heads
        self.wq = [tf.keras.layers.Dense(self.depth) for _ in range(num_heads)]
        self.wk = [tf.keras.layers.Dense(self.depth) for _ in range(num_heads)]
        self.wv = [tf.keras.layers.Dense(self.depth) for _ in range(num_heads)]
        self.wo = tf.keras.layers.Dense(d_model)
        self.softmax = tf.keras.layers.Softmax()

    def call(self, x, attention_mask):
        multi_attn = []
        for i in range(self.num_heads):
            Q = self.wq[i](x)
            K = self.wk[i](x)
            V = self.wv[i](x)
            multi_attn.append(scaled_dot_product(Q, K, V, self.softmax, attention_mask))
        multi_head = tf.concat(multi_attn, axis=-1)
        return self.wo(multi_head)

class Transformer(tf.keras.Model):
    def __init__(self, num_blocks):
        super().__init__()
        self.num_blocks = num_blocks
        self.mhas = [MultiHeadAttention(UNITS, 8) for _ in range(num_blocks)]
        self.mlps = [tf.keras.Sequential([
            tf.keras.layers.Dense(UNITS * MLP_RATIO, activation=GELU, kernel_initializer=INIT_GLOROT_UNIFORM),
            tf.keras.layers.Dropout(MLP_DROPOUT_RATIO),
            tf.keras.layers.Dense(UNITS, kernel_initializer=INIT_HE_UNIFORM)
        ]) for _ in range(num_blocks)]

    def call(self, x, attention_mask):
        for mha, mlp in zip(self.mhas, self.mlps):
            x = x + mha(x, attention_mask)
            x = x + mlp(x)
        return x

class LandmarkEmbedding(tf.keras.Model):
    def __init__(self, units, name):
        super().__init__()
        self.units = units
        self.name = name

    def build(self, input_shape):
        self.empty_embedding = self.add_weight(name=f"{self.name}_empty", shape=[self.units], initializer=INIT_ZEROS)
        self.dense = tf.keras.Sequential([
            tf.keras.layers.Dense(self.units, activation=GELU, use_bias=False),
            tf.keras.layers.Dense(self.units, use_bias=False)
        ])

    def call(self, x):
        mask = tf.reduce_sum(x, axis=2, keepdims=True) == 0
        return tf.where(mask, self.empty_embedding, self.dense(x))
import tensorflow as tf

# ----------------------------
# Serializable Layers
# ----------------------------

@tf.keras.utils.register_keras_serializable()
class MaskLayer(tf.keras.layers.Layer):
    def call(self, x):
        # x shape: (batch, time)
        return tf.expand_dims(tf.cast(tf.math.not_equal(x, -1), tf.float32), axis=-1)

    def compute_output_shape(self, input_shape):
        return input_shape + (1,)


@tf.keras.utils.register_keras_serializable()
class ReshapeLandmarks(tf.keras.layers.Layer):
    def __init__(self, start_idx, end_idx, output_dim, **kwargs):
        super().__init__(**kwargs)
        self.start_idx = start_idx
        self.end_idx = end_idx
        self.output_dim = output_dim

    def call(self, x):
        batch_size = tf.shape(x)[0]
        time_steps = tf.shape(x)[1]
        # Take only first 2 dims
        return tf.reshape(x[:, :, self.start_idx:self.end_idx, :2], [batch_size, time_steps, self.output_dim])

    def compute_output_shape(self, input_shape):
        batch, time, _, _ = input_shape
        return (batch, time, self.output_dim)


@tf.keras.utils.register_keras_serializable()
class WeightedSumLayer(tf.keras.layers.Layer):
    def call(self, inputs):
        x, mask = inputs
        return tf.reduce_sum(x * mask, axis=1) / tf.reduce_sum(mask, axis=1)

    def compute_output_shape(self, input_shape):
        # input_shape = [x_shape, mask_shape]
        return (input_shape[0][0], input_shape[0][2])  # (batch, features)


# ----------------------------
# Embedding (serializable)
# ----------------------------
@tf.keras.utils.register_keras_serializable()
class Embedding(tf.keras.Model):
    def __init__(self, units=512):
        super().__init__()
        self.lips_emb = LandmarkEmbedding(384, "lips")
        self.left_hand_emb = LandmarkEmbedding(384, "left_hand")
        self.pose_emb = LandmarkEmbedding(384, "pose")
        self.landmark_weights = tf.Variable(tf.zeros([3], dtype=tf.float32))
        self.fc = tf.keras.Sequential([
            tf.keras.layers.Dense(units, activation=tf.keras.activations.gelu),
            tf.keras.layers.Dense(units)
        ])
        self.positional_embedding = tf.keras.layers.Embedding(INPUT_SIZE + 1, units, embeddings_initializer=tf.keras.initializers.Constant(0.0))

    def call(self, lips, left_hand, pose, non_empty_frame_idxs):
        x = tf.stack([self.lips_emb(lips), self.left_hand_emb(left_hand), self.pose_emb(pose)], axis=-1)
        x = tf.reduce_sum(x * tf.nn.softmax(self.landmark_weights), axis=-1)
        x = self.fc(x)

        max_frame_idxs = tf.clip_by_value(tf.reduce_max(non_empty_frame_idxs, axis=1, keepdims=True), 1, np.PINF)
        norm_idx = tf.where(non_empty_frame_idxs == -1, INPUT_SIZE, tf.cast(non_empty_frame_idxs / max_frame_idxs * INPUT_SIZE, tf.int32))
        return x + self.positional_embedding(norm_idx)

# ----------------------------
# Build full model
# ----------------------------
def scce_with_ls(y_true, y_pred):
    y_true = tf.one_hot(tf.cast(y_true, tf.int32), NUM_CLASSES)
    return tf.keras.losses.categorical_crossentropy(y_true, y_pred, label_smoothing=0.25)

def get_model():
    frames = tf.keras.layers.Input([INPUT_SIZE, N_ROWS, N_DIMS], dtype=tf.float32, name="frames")
    non_empty_frame_idxs = tf.keras.layers.Input([INPUT_SIZE], dtype=tf.float32, name="non_empty_frame_idxs")

    mask = MaskLayer()(non_empty_frame_idxs)

    lips = ReshapeLandmarks(0, 40, 40*2)(frames)
    left_hand = ReshapeLandmarks(40, 61, 21*2)(frames)
    pose = ReshapeLandmarks(61, 66, 5*2)(frames)

    x = Embedding()(lips, left_hand, pose, non_empty_frame_idxs)
    x = Transformer(NUM_BLOCKS)(x, mask)
    x = WeightedSumLayer()([x, mask])
    x = tf.keras.layers.Dropout(CLASSIFIER_DROPOUT_RATIO)(x)
    outputs = tf.keras.layers.Dense(NUM_CLASSES, activation="softmax")(x)

    model = tf.keras.models.Model(inputs=[frames, non_empty_frame_idxs], outputs=outputs)
    optimizer = tf.keras.optimizers.Adam(
        learning_rate=LR_MAX,
        clipnorm=1.0
    )
    model.compile(loss=scce_with_ls, optimizer=optimizer, metrics=["sparse_categorical_accuracy"])
    return model

if __name__ == "__main__":
    
    model = get_model()

    # Save the original learning rate
    original_lr = model.optimizer.learning_rate

    model(
        {
            "frames": tf.zeros([1, INPUT_SIZE, N_ROWS, N_DIMS], tf.float32),
            "non_empty_frame_idxs": tf.zeros([1, INPUT_SIZE], tf.float32),
        }
    )
    ###### DELETE NEXT TIME
    OLD_LAST_MODEL_PATH = os.path.join("checkpoints", "last.keras")

    ###### DELETE NEXT TIME
    if os.path.exists(OLD_LAST_MODEL_PATH):
        print("Attempting to load weights from old last.keras...")
        model.load_weights(OLD_LAST_MODEL_PATH)
        print("✅ Weights loaded successfully from last.keras")
        model.optimizer.learning_rate = original_lr * 0.5


    ## Replacement:
    """if os.path.exists(LAST_WEIGHTS_PATH):
        print("Loading weights from last checkpoint...")
        model.load_weights(LAST_WEIGHTS_PATH)
    """
    # ----------------------------
    # Callbacks
    # ----------------------------
    # When restoring learning rate in callback:
    class RestoreLR(tf.keras.callbacks.Callback):
        def on_epoch_begin(self, epoch, logs=None):
            current_lr = self.model.optimizer.learning_rate
            current_lr_value = current_lr.numpy()  # Extract the value as a Python float
            
            print(f"Epoch {epoch}: Current learning rate = {current_lr_value:.6f}")

            if epoch == 28:  # Restore LR after epoch 28 (you can change this number)
                self.model.optimizer.learning_rate.assign(LR_MAX)  # Properly update the learning rate
                print(f"✅ Restored learning rate to {LR_MAX:.6f}")


    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            BEST_WEIGHTS_PATH,
            monitor="val_loss",
            save_best_only=True,
            save_weights_only=True,
            verbose=1,
        ),
        tf.keras.callbacks.ModelCheckpoint(
            LAST_WEIGHTS_PATH,
            save_best_only=False,
            save_weights_only=True,
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=PATIENCE,
            restore_best_weights=True,
            verbose=1,
        )
    ]
    callbacks.append(RestoreLR())


    # ----------------------------
    # Train
    # ----------------------------
    history = model.fit(
        train_dataset,
        validation_data=val_dataset,
        epochs=N_EPOCHS,
        initial_epoch=27,   ###### DELETE NEXT TIME.... OR replace with the appropriate number
        verbose=VERBOSE,
        callbacks=callbacks
    )


    # ----------------------------
    # Save final model
    # ----------------------------
    model.save("signsense_pathA.keras")
    model.save_weights("signsense_pathA.weights.h5")

    # ----------------------------
    # Optional TFLite conversion
    # ----------------------------
    class TFLiteModel(tf.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        @tf.function(input_signature=[tf.TensorSpec([None, INPUT_SIZE, N_ROWS, N_DIMS], tf.float32),
                                    tf.TensorSpec([None, INPUT_SIZE], tf.float32)])
        def __call__(self, frames, non_empty_frame_idxs):
            outputs = self.model({"frames": frames, "non_empty_frame_idxs": non_empty_frame_idxs})
            return {"outputs": outputs}

    tflite_converter = tf.lite.TFLiteConverter.from_concrete_functions(
        [TFLiteModel(model).__call__.get_concrete_function()]
    )
    tflite_model = tflite_converter.convert()
    with open("signsense_pathA.tflite", "wb") as f:
        f.write(tflite_model)

    print("Training complete. Models saved: 'signsense_pathA.keras' and 'signsense_pathA.tflite'")
