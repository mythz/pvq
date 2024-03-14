-- Update Tags to use `,` separator rather than `|`
UPDATE posts SET Tags = REPLACE(Tags, '|', ',');

-- Remove all duplicate rows from the 'posts' table
delete from posts where Id in (SELECT MIN(Id)
                 FROM (SELECT Id, COUNT(*) AS cnt
                       FROM posts
                       GROUP BY Id
                       HAVING cnt > 1) AS temp
                 GROUP BY Id)

-- Add indexes to the 'posts' table for Score and ViewCount
CREATE INDEX idx_score ON posts(Score);
CREATE INDEX idx_viewcount ON posts(ViewCount);
