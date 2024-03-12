#!/bin/bash
aws s3 sync s3://stackoverflow-shootout/sql/ ./data/ --endpoint-url https://b95f38ca3a6ac31ea582cd624e6eb385.r2.cloudflarestorage.com

# Set the path to your SQLite database file
DB_FILE="./data/filtered.db"

echo "Starting database creation process..."

# Create the SQLite database
echo "Creating the SQLite database using create.sql..."
sqlite3 "$DB_FILE" < ./data/create.sql
echo "Database created successfully."

echo "Running *_posts.sql files..."

# Run all the ./data/*_posts.sql files
for post_file in ./data/*_posts.sql; do
    echo "Running $post_file..."
    sqlite3 "$DB_FILE" < "$post_file"
    echo "$post_file executed successfully."
done

echo "All *_posts.sql files executed successfully."

# Run the cleanup.sql script
echo "Running cleanup.sql..."
sqlite3 "$DB_FILE" < ./data/cleanup.sql
echo "Cleanup script executed successfully."

echo "Database creation process completed."
