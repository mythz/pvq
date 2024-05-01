using System.Linq;
using System.IO;
using ServiceStack;
using ServiceStack.Text;
using ServiceStack.Data;
using ServiceStack.DataAnnotations;
using ServiceStack.OrmLite;

var searchDbPath = "../dist/search.db".MapProjectPath();
if (File.Exists(searchDbPath)) File.Delete(searchDbPath);
var dbFactory = new OrmLiteConnectionFactory(searchDbPath, SqliteDialect.Provider);

using var db = dbFactory.Open();

db.ExecuteNonQuery($@"CREATE VIRTUAL TABLE {nameof(PostFts)}
USING FTS5(
    {nameof(PostFts.RefId)},
    {nameof(PostFts.UserName)},
    {nameof(PostFts.Body)},
    {nameof(PostFts.Tags)},
    {nameof(PostFts.ModifiedDate)}
);");

var questionsDir = "../questions/";
var allFiles = Directory.GetFiles(questionsDir, "*.json", SearchOption.AllDirectories);
Console.WriteLine($"Found {allFiles.Length} files");

var existingIds = new HashSet<string>();
var answerIds = new HashSet<int>();
var nextId = 100_000_000;
var minDate = new DateTime(2008,08,1);

var i = 0;
foreach (var allFile in allFiles)
{
    i++;
    // if (i > 100) break;
    var file = allFile.Replace('\\','/');
    var filePath = file.Substring(questionsDir.Length);
    var fileId = filePath.LeftPart('.').Replace("/","");
    if (!long.TryParse(fileId, out var id)) {
        Console.WriteLine($"Skipping invalid postId in {filePath}");
        continue;
    }

    var fileType = filePath.RightPart('.').LastLeftPart('.');

    try
    {
        if (fileType == "json")
        {
            var post = ToPost(file);
            var refId = post.RefId ?? $"{post.Id}";
            if (!existingIds.Add(refId)) 
                continue;
            log($"Adding Question {filePath}");
            var modifiedDate = post.LastEditDate ?? (post.CreationDate > minDate ? post.CreationDate : minDate);
            db.ExecuteNonQuery($@"INSERT INTO {nameof(PostFts)} (
                rowid,
                {nameof(PostFts.RefId)},
                {nameof(PostFts.UserName)},
                {nameof(PostFts.Body)},
                {nameof(PostFts.Tags)},
                {nameof(PostFts.ModifiedDate)}
            ) VALUES (
                {post.Id},
                '{refId}',
                'stackoverflow',
                {SqliteDialect.Provider.GetQuotedValue(post.Title + "\n\n" + post.Body)},
                {SqliteDialect.Provider.GetQuotedValue(post.Tags)},
                {SqliteDialect.Provider.GetQuotedValue(modifiedDate.ToString("yyyy-MM-dd HH:mm:ss"))}
            )");
        }
        else if (file.Contains(".h."))
        {
            var post = ToPost(file);
            post.CreatedBy ??= fileType.Substring(2); 
            var refId = post.RefId ?? post.GetRefId();
            if (!existingIds.Add(refId))
                continue;
            if (post.Id > 0)
            {
                if (answerIds.Contains(post.Id))
                    continue;
                answerIds.Add(post.Id);
            }

            log($"Adding Human Answer {filePath}");
            var modifiedDate = post.LastEditDate ?? (post.CreationDate > minDate ? post.CreationDate : minDate);
            var answerId = post.Id > 0 ? post.Id : nextId++;            
            db.ExecuteNonQuery($@"INSERT INTO {nameof(PostFts)} (
                rowid,
                {nameof(PostFts.RefId)},
                {nameof(PostFts.UserName)},
                {nameof(PostFts.Body)},
                {nameof(PostFts.ModifiedDate)}
            ) VALUES (
                {answerId},
                '{refId}',
                '{post.CreatedBy}',
                {SqliteDialect.Provider.GetQuotedValue(post.Body)},
                {SqliteDialect.Provider.GetQuotedValue(modifiedDate.ToString("yyyy-MM-dd HH:mm:ss"))}
            )");
        }
        else if (filePath.EndsWith(".meta.json"))
        {
            //ignore
        }
        else
        {
            Console.WriteLine($"Skipping {filePath}");
        }
    } 
    catch (Exception e)
    {
        Console.WriteLine($"ERROR {filePath}: {e.Message}");
    }
}
db.ExecuteSql("VACUUM;");


void log(string message)
{
    if (i % 200 == 0)
    {
        Console.WriteLine(i + ": " + message);
    }
}

Post ToPost(string path)
{
    var json = File.ReadAllText(path);
    var post = json.FromJson<Post>();
    return post;
}

public class PostFts
{
    public int Id { get; set; }
    public string RefId { get; set; }
    public string UserName { get; set; }
    public string Body { get; set; }
    public string? Tags { get; set; }
    public string? ModifiedDate { get; set; }
}

public class Post
{
    public int Id { get; set; }

    [Required] public int PostTypeId { get; set; }

    public int? AcceptedAnswerId { get; set; }

    public int? ParentId { get; set; }

    public int Score { get; set; }

    public int? ViewCount { get; set; }

    public string Title { get; set; }

    public int? FavoriteCount { get; set; }

    public DateTime CreationDate { get; set; }

    public DateTime LastActivityDate { get; set; }

    public DateTime? LastEditDate { get; set; }

    public int? LastEditorUserId { get; set; }

    public int? OwnerUserId { get; set; }

    public string Tags { get; set; }

    public string Slug { get; set; }

    public string Summary { get; set; }
    
    public DateTime? RankDate { get; set; }
    
    public int? AnswerCount { get; set; }

    public string? CreatedBy { get; set; }
    
    public string? ModifiedBy { get; set; }
    
    public string? RefId { get; set; }

    public string? Body { get; set; }

    public string? ModifiedReason { get; set; }
    
    public DateTime? LockedDate { get; set; }

    public string? LockedReason { get; set; }

    public string GetRefId() => RefId ?? $"{Id}-{CreatedBy}";
}