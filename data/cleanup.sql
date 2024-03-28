-- Drop the 'Body' column from the 'posts' table
Update main.post set Body = null;

-- Vacuum the database to reclaim unused space
VACUUM;