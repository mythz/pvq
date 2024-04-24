import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Input, LayerNormalization, Dropout, MultiHeadAttention


def create_transformer_model(input_shape, num_classes, num_layers, num_heads, hidden_dim, dropout_rate):
    inputs = Input(shape=input_shape)
    x = tf.keras.layers.Reshape((input_shape[0], 1))(inputs)  # Reshape the input tensor

    for _ in range(num_layers):
        # Multi-head self-attention
        attention_output = MultiHeadAttention(num_heads=num_heads, key_dim=hidden_dim)(x, x)
        attention_output = Dropout(dropout_rate)(attention_output)
        x = LayerNormalization(epsilon=1e-6)(x + attention_output)

        # Feedforward network
        ffn_output = Dense(hidden_dim, activation='relu')(x)
        ffn_output = Dense(hidden_dim)(ffn_output)
        ffn_output = Dropout(dropout_rate)(ffn_output)
        x = LayerNormalization(epsilon=1e-6)(x + ffn_output)

    # Global average pooling
    x = tf.keras.layers.GlobalAveragePooling1D()(x)

    # Output layer
    outputs = Dense(num_classes, activation='softmax')(x)

    model = tf.keras.Model(inputs=inputs, outputs=outputs)
    return model
