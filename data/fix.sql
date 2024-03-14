-- Update Tags to use `,` separator rather than `|`
UPDATE post SET Tags = REPLACE(Tags, '|', ',');

-- Add indexes to the 'posts' table for Score and ViewCount
CREATE INDEX idx_score ON post(Score);
CREATE INDEX idx_viewcount ON post(ViewCount);

