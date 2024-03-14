-- Update Tags to use `,` separator rather than `|`
UPDATE posts SET Tags = REPLACE(Tags, '|', ',');

-- Add indexes to the 'posts' table for Score and ViewCount
CREATE INDEX idx_score ON posts(Score);
CREATE INDEX idx_viewcount ON posts(ViewCount);
