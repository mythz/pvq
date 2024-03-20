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
    {nameof(PostFts.Title)},
    {nameof(PostFts.Tags)}
);");

var questionsDir = "../questions/";
var allFiles = Directory.GetFiles(questionsDir, "*.json", SearchOption.AllDirectories);
Console.WriteLine($"Found {allFiles.Length} files");

var existingIds = new HashSet<int>();
var modelAnswerNextId = 100_000_000;

var i = 0;
foreach (var allFile in allFiles)
{
    i++;
    var file = allFile.Replace('\\','/');
    var filePath = file.Substring(questionsDir.Length);
    var id = long.Parse(filePath.LeftPart('.').Replace("/",""));
    var fileType = filePath.RightPart('.').LastLeftPart('.');

    try
    {
        if (fileType == "json")
        {
            var post = ToPost(file);
            if (existingIds.Contains(post.Id)) continue;
            existingIds.Add(post.Id);
            log($"Adding Question {filePath}");
            db.ExecuteNonQuery($@"INSERT INTO {nameof(PostFts)} (
                rowid,
                {nameof(PostFts.RefId)},
                {nameof(PostFts.UserName)},
                {nameof(PostFts.Body)},
                {nameof(PostFts.Title)},
                {nameof(PostFts.Tags)}
            ) VALUES (
                {post.Id},
                '{post.Id}',
                'stackoverflow',
                {SqliteDialect.Provider.GetQuotedValue(post.Body)},
                {SqliteDialect.Provider.GetQuotedValue(post.Title)},
                {SqliteDialect.Provider.GetQuotedValue(post.Tags)}
            )");
        }
        else if (fileType.StartsWith("h."))
        {
            var post = ToPost(file);
            if (existingIds.Contains(post.Id)) continue;
            existingIds.Add(post.Id);
            var userName = fileType.Substring(2); 
            log($"Adding Human Answer {filePath}");
            db.ExecuteNonQuery($@"INSERT INTO {nameof(PostFts)} (
                rowid,
                {nameof(PostFts.RefId)},
                {nameof(PostFts.UserName)},
                {nameof(PostFts.Body)}
            ) VALUES (
                {post.Id},
                '{id}-{userName}',
                '{userName}',
                {SqliteDialect.Provider.GetQuotedValue(post.Body)}
            )");
        }
        else if (fileType.StartsWith("a."))
        {
            var json = File.ReadAllText(file);
            var obj = (Dictionary<string,object>)JSON.parse(json);
            var choices = (List<object>) obj["choices"];
            var choice = (Dictionary<string,object>)choices[0];
            var message = (Dictionary<string,object>)choice["message"];
            var body = (string)message["content"];
            var userName = fileType.Substring(2); 
            log($"Adding Model Answer {filePath} {userName} {body}");
            db.ExecuteNonQuery($@"INSERT INTO {nameof(PostFts)} (
                rowid,
                {nameof(PostFts.RefId)},
                {nameof(PostFts.UserName)},
                {nameof(PostFts.Body)}
            ) VALUES (
                {modelAnswerNextId++},
                '{id}-{userName}',
                '{userName}',
                {SqliteDialect.Provider.GetQuotedValue(body)}
            )");
        }
        else
        {
            Console.WriteLine($"Skipping {filePath}");
        }
    } 
    catch(Exception e)
    {
        Console.WriteLine($"ERROR {filePath}: {e.Message}");
    }
}
db.ExecuteSql("VACUUM;");


void log(string message)
{
    if (i % 100 == 0)
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
    public string? Title { get; set; }
    public string? Tags { get; set; }
}

public class Post
{
    public int Id { get; set; }
    
    [Required]
    public int PostTypeId { get; set; }

    public int? AcceptedAnswerId { get; set; }

    public int? ParentId { get; set; }

    public int Score { get; set; }

    public int? ViewCount { get; set; }

    public string Title { get; set; }

    public string ContentLicense { get; set; }

    public int? FavoriteCount { get; set; }

    public DateTime CreationDate { get; set; }

    public DateTime LastActivityDate { get; set; }

    public DateTime? LastEditDate { get; set; }

    public int? LastEditorUserId { get; set; }

    public int? OwnerUserId { get; set; }

    public string Tags { get; set; }
    
    public string Body { get; set; }
    
    public string Slug { get; set; }

    public string Summary { get; set; }
}