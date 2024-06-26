#!/bin/bash
aws s3 sync s3://pvq-build/ ./data/ --exclude "*" --include "*data_post.sql" --include "*highest-score-answers.json" --profile r2 --endpoint-url https://b95f38ca3a6ac31ea582cd624e6eb385.r2.cloudflarestorage.com

# Set the path to your SQLite database file
DB_FILE="./data/filtered.db"

# If DB_FILE exists, return an error
if [ -f "$DB_FILE" ]; then
    echo "The database file $DB_FILE already exists, deleting it..."
    rm "$DB_FILE"
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

# Copy the database to the dist directory
cp "$DB_FILE" "./dist/app.db"

# Run the import script
echo "Running import script..."
sleep 1

cd import
dotnet run --project import.csproj --skip-files
cd ..

sleep 1
echo "Import script executed successfully."

# Run the cleanup.sql script
echo "Running cleanup.sql..."
sqlite3 "./dist/app.db" < ./data/cleanup.sql
echo "Cleanup script executed successfully."

# Run the `meta` script
echo "Running meta import script..."
cd rebuild-meta
dotnet run --project meta.csproj
cd ..

echo "Database creation process completed."

# Check if the ../pvq.app directory exists
if [ -d "../pvq.app" ]; then
    echo "Running pvq.app Migration..."
    cd ../pvq.app/MyApp/
    cp ../../pvq/dist/app.db ./App_Data/app.db
    npm run migrate
    echo "Migration completed."
else
    echo "Running pvq Migration..."
    cd ..
    cp ./pvq/dist/app.db ./App_Data/app.db
    export APP_ID=$(docker compose run --entrypoint "id -u" --rm app)
    docker compose run --entrypoint "chown $APP_ID:$APP_ID /app/App_Data" --user root --rm app
    docker compose up app-migration --exit-code-from app-migration
    echo "Migration completed."
fi
