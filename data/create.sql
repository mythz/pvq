create table main.post
(
    Id               INTEGER PRIMARY KEY,
    PostTypeId       INTEGER,
    AcceptedAnswerId INTEGER,
    ParentId         INTEGER,
    Score            INTEGER,
    ViewCount        INTEGER,
    Body             TEXT,
    Title            TEXT,
    ContentLicense   TEXT,
    FavoriteCount    INTEGER,
    CreationDate     TEXT,
    LastActivityDate TEXT,
    LastEditDate     TEXT,
    LastEditorUserId INTEGER,
    OwnerUserId      INTEGER,
    Tags             TEXT,
    Slug             TEXT,
    Summary          TEXT,
    RankDate         TEXT,
    AnswerCount      INTEGER,
    CreatedBy        TEXT,
    ModifiedBy       TEXT,
    RefId            TEXT
);

