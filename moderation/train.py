import numpy as np
import pandas as pd
from keras import Sequential
from keras.src.layers import Dense, LeakyReLU, Dropout
from keras.src.optimizers import Adam
from keras.src.optimizers.adamw import AdamW
from keras.src.utils import to_categorical, pad_sequences
from transformers import AutoTokenizer
import tensorflow as tf
import os

from model_utils import create_transformer_model

# Load in `.env` file for HF_TOKEN
from dotenv import load_dotenv

load_dotenv()

print("Num GPUs Available: ", len(tf.config.experimental.list_physical_devices('GPU')))

# Now our data is ready for analysis
labels = ["GOOD", "BAD", "UNKNOWN"]

# Load the training data from JSONL file
existing_data = pd.read_json('./data/training_data.jsonl', lines=True)

print('Loaded data...')
print('Existing data shape:', existing_data.shape)

# Prep the data for training by adding a Label column based on the NeedsModeration column
existing_data['Label'] = existing_data['NeedsModeration'].apply(lambda x: 'BAD' if x else 'GOOD')


def clear_data(df):
    # Remove columns that we don't need like PostId_x,PostId_y,FavoriteCount,ViewCount,DownVotes,StartingUpVotes,CreatedBy,AnswerPath,PostId,Id
    # check if column exists before dropping each
    if 'PostId_x' in df.columns:
        df.drop('PostId_x', axis=1, inplace=True)
    if 'PostId_y' in df.columns:
        df.drop('PostId_y', axis=1, inplace=True)
    if 'FavoriteCount' in df.columns:
        df.drop('FavoriteCount', axis=1, inplace=True)
    if 'ViewCount' in df.columns:
        df.drop('ViewCount', axis=1, inplace=True)
    if 'DownVotes' in df.columns:
        df.drop('DownVotes', axis=1, inplace=True)
    if 'StartingUpVotes' in df.columns:
        df.drop('StartingUpVotes', axis=1, inplace=True)
    if 'CreatedBy' in df.columns:
        df.drop('CreatedBy', axis=1, inplace=True)
    if 'AnswerPath' in df.columns:
        df.drop('AnswerPath', axis=1, inplace=True)
    if 'PostId' in df.columns:
        df.drop('PostId', axis=1, inplace=True)
    if 'Name' in df.columns:
        df.drop('Name', axis=1, inplace=True)
    if 'CharTotals' in df.columns:
        df.drop('CharTotals', axis=1, inplace=True)
    if 'WordTotals' in df.columns:
        df.drop('WordTotals', axis=1, inplace=True)


clear_data(existing_data)

print('Prepped data...')
# Randomize the order of the training data, and slice the first 80% for training and the remaining 20% for validation
random_data = existing_data.sample(frac=0.20).reset_index(drop=True)
# Split known bad data in half using existing_data['NeedsModeration'] == True] and `sample`, save to `known_bad_data` and `eval_bad_data`
all_known_bad_data = existing_data[existing_data['NeedsModeration'] == True].copy()
eval_bad_data = all_known_bad_data.sample(frac=0.2).reset_index(drop=True)
# Use eval_bad_data index to drop from all_known_bad_data
known_bad_data = all_known_bad_data.drop(all_known_bad_data.index[eval_bad_data.index])

existing_data = pd.concat([random_data, known_bad_data], ignore_index=True)

# Randomize the order of the training data, and slice the first 80% for training and the remaining 20% for validation
existing_data = existing_data.sample(frac=1).reset_index(drop=True)

# Log out the percentage of data that is bad in the training data
print('Percentage of bad data:', existing_data['NeedsModeration'].mean())

# Drop the 'NeedsModeration' column
existing_data.drop('NeedsModeration', axis=1, inplace=True)

print('Data prepped...')

tokenized_labels = []

print('Loading tokenizer...')
# Load tokenizer using HuggingFace's Tokenizer library
tokenizer = AutoTokenizer.from_pretrained('mistralai/Mixtral-8x7B-v0.1')

# Assuming `labels` is a list of unique labels
label_dict = {label: i for i, label in enumerate(labels)}
num_classes = len(label_dict)

# Create a new column with a concatenated string of the metadata fields
# Do this by enumerating the columns and concatenating them with '<sep>{column_name}={column_value}'
existing_data['Input'] = existing_data.apply(lambda row: '<sep>'.join(f'{col}={row[col]}\n' for col in existing_data.columns if col != 'Id'), axis=1)

print('Tokenizing and padding...')

# Assuming 'max_length' is the length to which sequences were padded during training
max_length = 256

# Tokenize and pad descriptions
tokenized_descriptions = [tokenizer.encode(desc, return_tensors='tf').numpy()[0] for desc in existing_data['Input']]
padded_descriptions = pad_sequences(tokenized_descriptions, padding='post', maxlen=max_length)


# Convert labels to indices and then to one-hot vectors
label_indices = [label_dict[label] for label in existing_data['Label']]
one_hot_labels = to_categorical(label_indices, num_classes=num_classes)

print(padded_descriptions.shape)

print('Building model...')

# Normalize the input data
padded_descriptions = padded_descriptions / np.max(padded_descriptions)

# Create the model
input_shape = (padded_descriptions.shape[1],)
num_classes = len(label_dict)
num_layers = 6
num_heads = 8
hidden_dim = 512
dropout_rate = 0.2

# Define the Keras model with the correct input shape
model = Sequential([
    Dense(512, input_shape=(padded_descriptions.shape[1],), activation='relu'),
    Dense(512, activation='relu'),
    Dense(512, activation='relu'),
    Dense(512, activation='relu'),
    Dense(512, activation='relu'),
    Dense(512, activation='relu'),
    Dense(512, activation='relu'),
    Dense(512, activation='relu'),
    Dense(num_classes, activation='softmax')
])

# Compile the model
optimizer = AdamW(learning_rate=1e-6, clipnorm=1.0)
model.compile(optimizer=optimizer, loss='categorical_crossentropy', metrics=['accuracy'])

# If model exists, load it, else train it
if os.path.exists('./data/moderation_model.h5'):
    model.load_weights('./data/moderation_model.h5')
else:
    # Train the model
    model.fit(padded_descriptions, one_hot_labels, epochs=10, batch_size=32)
    # Save the model
    model.save('./data/moderation_model.h5')

# Test the model
original_test_data = pd.read_json('./data/training_data.jsonl', lines=True)

# Grab random subset of test data
test_data = original_test_data[original_test_data['NeedsModeration'] == True].sample(frac=1).reset_index(drop=True)
test_data = pd.concat([test_data, original_test_data[original_test_data['NeedsModeration'] == False].sample(frac=1).reset_index(drop=True)], ignore_index=True)

# Mix in some known bad data
# test_data = pd.concat([test_data, eval_bad_data, eval_bad_data,eval_bad_data,
#                        eval_bad_data,eval_bad_data,eval_bad_data,eval_bad_data], ignore_index=True)
test_data = test_data.sample(frac=1).reset_index(drop=True)

# Log percentage of bad data in test data
print('Percentage of bad data in test data:', test_data['NeedsModeration'].mean())

# clear_data(test_data)

# Copy test_data with known labels
known_labels = test_data.copy()

# Take a small sample of original data to mix in
original_test_data = original_test_data.sample(frac=0.25).reset_index(drop=True)
clear_data(original_test_data)

# Drop the 'NeedsModeration' column
if 'NeedsModeration' in test_data.columns:
    test_data.drop('NeedsModeration', axis=1, inplace=True)

# Create the empty Label column
test_data['Label'] = np.nan

# Filter test_data where the 'Label' column is empty and not NaN
# test_data = test_data[test_data['Label'].isnull()]

clear_data(test_data)

# Create a new column with a concatenated string of the metadata fields, excluding the 'Id' column
test_data['Input'] = test_data.apply(lambda row: '<sep>'.join(f'{col}={row[col]}\n' for col in test_data.columns if col != 'Id'), axis=1)

# Size of test_data
print('Test data shape:', test_data.shape)

# Tokenize and pad descriptions for test data
tokenized_test_descriptions = [tokenizer.encode(desc, return_tensors='tf').numpy()[0] for desc in test_data['Input']]
padded_test_descriptions = pad_sequences(tokenized_test_descriptions, padding='post', maxlen=max_length)

# Make predictions with the model on the padded test data
predictions = model.predict(padded_test_descriptions)

# Convert predictions to label indices (e.g., using argmax if your output is one-hot encoded)
predicted_labels = np.argmax(predictions, axis=1)

# Update the 'Label' column with the predicted labels
test_data['Label'] = [labels[label] for label in predicted_labels]

# Add the known labels back to the test data in the 'Actual' column via NeedsModeration mapping GOOD and BAD
test_data['Actual'] = known_labels['NeedsModeration'].apply(lambda x: 'BAD' if x else 'GOOD')

# Evaluate the score of the model by checking the accuracy of the predicted 'Label' vs the 'Actual' column
accuracy = (test_data['Label'] == test_data['Actual']).mean()
print(f'Model accuracy: {accuracy:.5f}')

# Drop the 'Training' column
test_data.drop('Input', axis=1, inplace=True)

# Write the fully labeled DataFrame to a CSV file
test_data.to_csv('./data/test_output.csv', index=False)
