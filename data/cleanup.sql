-- Drop the 'Body' column from the 'posts' table
ALTER TABLE posts DROP COLUMN Body;

-- Vacuum the database to reclaim unused space
VACUUM;