-- Drop the 'Body' column from the 'posts' table
UPDATE main.post SET Body = null;

-- Set StackOverflow posts to be created by 'stackoverflow' user
UPDATE main.post SET CreatedBy = 'stackoverflow' where CreatedBy is null;
-- UPDATE main.StatTotals SET CreatedBy = 'stackoverflow' where CreatedBy is null;

-- Vacuum the database to reclaim unused space
VACUUM;