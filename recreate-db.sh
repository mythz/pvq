#!/bin/bash
aws s3 sync s3://stackoverflow-shootout/sql/data_post.sql ./data/data_post.sql --endpoint-url https://b95f38ca3a6ac31ea582cd624e6eb385.r2.cloudflarestorage.com

# Set the path to your SQLite database file
DB_FILE="./data/filtered.db"

# If DB_FILE exists, return an error
if [ -f "$DB_FILE" ]; then
    echo "Error: The database file $DB_FILE already exists."
    echo "Please remove the existing database file before running this script."
    exit 1
fi

echo "Starting database creation process..."

# Create the SQLite database
echo "Creating the SQLite database using create.sql..."
sqlite3 "$DB_FILE" < ./data/create.sql
echo "Database created successfully."

echo "Running *_posts.sql files..."

# Import data
sqlite3 "$DB_FILE" < "./data/data_post.sql"

echo "All *_posts.sql files executed successfully."

# Run the fix.sql script
echo "Running fix.sql..."
sqlite3 "$DB_FILE" < ./data/fix.sql
echo "Fix script executed successfully."

# Check if --cleanup flag is provided
if [ "$1" = "--cleanup" ]; then
    echo "Cleanup flag detected. Running cleanup.sql..."
    # Run the cleanup.sql script
    echo "Running cleanup.sql..."
    sqlite3 "$DB_FILE" < ./data/cleanup.sql
    echo "Cleanup script executed successfully."
else
    echo "No cleanup flag detected. Use --cleanup to remove the original tables."
fi

echo "Database creation process completed."
