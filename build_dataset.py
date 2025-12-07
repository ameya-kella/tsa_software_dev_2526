import os
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.model_selection import train_test_split

# --------------------- Project Paths ---------------------
PROJECT_DIR = r"C:\Users\ameya\Documents\Projects\tsa_software_dev_2526"
LANDMARKS_DIR = os.path.join(PROJECT_DIR, "npy_landmarks")  # matches extract_landmarks.py output
CSV_PATH = os.path.join(PROJECT_DIR, "train_data_map.csv")

# --------------------- Hyperparameters ---------------------
BATCH_SIZE = 8
MAX_SENTENCE_LENGTH = 50  # maximum token length including <sos> and <eos>
PREFETCH_SIZE = tf.data.AUTOTUNE

# --------------------- Load CSV ---------------------
df = pd.read_csv(CSV_PATH)

# Keep only rows that have a corresponding landmark file
def landmark_exists(row):
    path = os.path.join(LANDMARKS_DIR, f"{row['SENTENCE_NAME']}.npy")
    return os.path.exists(path)

df = df[df.apply(landmark_exists, axis=1)].reset_index(drop=True)
print(f"Total usable clips: {len(df)}")

# --------------------- Load landmark sequences ---------------------
def load_landmarks(filename):
    return np.load(os.path.join(LANDMARKS_DIR, f"{filename}.npy")).astype(np.float32)

df['landmarks'] = df['SENTENCE_NAME'].apply(load_landmarks)

# --------------------- Tokenize English sentences ---------------------
sentences = df['ENGLISH_SENTENCE'].tolist()

tokenizer = tf.keras.layers.TextVectorization(
    standardize='lower_and_strip_punctuation',
    max_tokens=None,  # include all tokens
    output_sequence_length=MAX_SENTENCE_LENGTH-2,  # reserve space for <sos> and <eos>
    output_mode='int'
)
tokenizer.adapt(sentences)

# Vocabulary size for Transformer
VOCAB_SIZE = len(tokenizer.get_vocabulary())
print(f"Vocabulary size: {VOCAB_SIZE}")

# Assign special token IDs
SOS_ID = VOCAB_SIZE
EOS_ID = VOCAB_SIZE + 1

def encode_sentence(sentence):
    tokenized = tokenizer([sentence])[0].numpy()
    tokenized = np.concatenate([[SOS_ID], tokenized, [EOS_ID]])
    return tokenized.astype(np.int32)

df['tokenized'] = df['ENGLISH_SENTENCE'].apply(encode_sentence)

# --------------------- Train/Val/Test Split ---------------------
train_df, test_df = train_test_split(df, test_size=0.1, random_state=42)
train_df, val_df = train_test_split(train_df, test_size=0.1111, random_state=42)  # 0.1111*0.9 ~ 0.1

# --------------------- Dataset Conversion ---------------------
def generator(df_subset):
    for _, row in df_subset.iterrows():
        yield row['landmarks'], row['tokenized']

def create_dataset(df_subset, shuffle=False):
    output_signature = (
        tf.TensorSpec(shape=(None, 543, 4), dtype=tf.float32),
        tf.TensorSpec(shape=(None,), dtype=tf.int32)
    )
    ds = tf.data.Dataset.from_generator(lambda: generator(df_subset), output_signature=output_signature)
    if shuffle:
        ds = ds.shuffle(buffer_size=len(df_subset))
    ds = ds.padded_batch(
        batch_size=BATCH_SIZE,
        padded_shapes=(
            [None, 543, 4],  # pad landmark sequences to max length in batch
            [None]            # pad token sequences to max length in batch
        ),
        padding_values=(
            0.0,              # landmarks padded with zeros
            0                 # tokens padded with 0 (masking)
        )
    )
    ds = ds.prefetch(PREFETCH_SIZE)
    return ds

train_ds = create_dataset(train_df, shuffle=True)
val_ds = create_dataset(val_df)
test_ds = create_dataset(test_df)

print("✅ Datasets ready: train_ds, val_ds, test_ds")
