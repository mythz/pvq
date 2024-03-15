using ServiceStack;
using ServiceStack.Text;
using ServiceStack.OrmLite;
using ServiceStack.DataAnnotations;

if (File.Exists("../questions/app.db".MapProjectPath())) File.Delete("../questions/app.db".MapProjectPath());
File.Copy("../data/filtered.db".MapProjectPath(), "../questions/app.db".MapProjectPath());

var dbFactory = new OrmLiteConnectionFactory("../questions/app.db".MapProjectPath(), SqliteDialect.Provider);
var dbFactoryOriginal = new OrmLiteConnectionFactory("../data/stackoverflow_posts.db".MapProjectPath(), SqliteDialect.Provider);

using var db = dbFactory.Open();

Console.WriteLine("Fetching Posts...");
var allPosts = db.Select<Post>();
var allPostIds = allPosts.ConvertAll(x => x.Id);
var allAcceptedAnswerIds = allPosts.ConvertAll(x => x.AcceptedAnswerId)
    .Where(x => x.HasValue).Select(x => x.Value).ToList();

Console.WriteLine("Selecting Posts from Original DB...");
using var origDb = dbFactoryOriginal.Open();
// origDb.Select<Post>(q => Sql.In(q.Id, allPostIds)); produces a SQL error, build the query manually
var acceptedAnswerSql = $"select * from posts where id in ({string.Join(",", allAcceptedAnswerIds)})";
var acceptedAnswers = origDb.Select<Post>(acceptedAnswerSql);

// Create a map of accepted answers to question posts
var acceptedAnswerMap = acceptedAnswers.ToDictionary(x => x.ParentId, x => x);

Console.WriteLine("Selecting Highest voted answers from Original DB...");
// Create a map of highest scoring answers to question posts, using HAVING MAX(score) to group by parentid
var highestScoreAnswerSql = $"select * from posts where parentid in ({string.Join(",", allPostIds)}) and posttypeid = 2 group by parentid having max(score)";
var highestScoreAnswers = origDb.Select<Post>(highestScoreAnswerSql);
var highestScoreAnswerMap = highestScoreAnswers.ToDictionary(x => x.ParentId, x => x);

Console.WriteLine($"Fetched {allPosts.Count} Posts");
int processedCount = 0;
foreach(var post in allPosts)
{
    if (processedCount % 1000 == 0)
    {
        Console.WriteLine($"Processed {processedCount} Posts");
    }
    try
    {
        var body = post.Body;
        var slug = post.Title.GenerateSlug(maxLength:200);
        var summary = body.SubstringWithEllipsis(0, 200);
        post.Summary = summary;
        post.Slug = slug;
    }
    catch(Exception e)
    {
        Console.WriteLine($"Failed {post.Id}: {e.Message}");
        Console.WriteLine(post.ToJson());
        //select id, tags, slug, summary from post where id = 24797485;
    }
    processedCount++;
}

// Update all posts
db.UpdateAll(allPosts);

//Write files to ./questions/???/???/???.json where path is the padded nine 0s of the Id
Console.WriteLine("Writing Posts to files...");
var writtenCount = 0;
foreach(var post in allPosts)
{
    if (writtenCount % 1000 == 0)
    {
        Console.WriteLine($"Written {writtenCount} Posts");
    }
    var path = post.Id.ToString("000000000");
    var dir = Path.Combine("../questions", path.Substring(0,3), path.Substring(3,3));
    Directory.CreateDirectory(dir);
    var json = JsonSerializer.SerializeToString(post);
    File.WriteAllText(Path.Combine(dir, path.Substring(6,3) + ".json"), json);
    
    //Write the accepted answer if it exists
    if (acceptedAnswerMap.TryGetValue(post.Id, out var acceptedAnswer))
    {
        var acceptedAnswerPath = Path.Combine(dir, path.Substring(6,3) + ".h.accepted.json");
        File.WriteAllText(acceptedAnswerPath, JsonSerializer.SerializeToString(acceptedAnswer));
    }
    
    //Write the highest scoring answer if it exists
    if (highestScoreAnswerMap.TryGetValue(post.Id, out var highestScoreAnswer))
    {
        var highestScoreAnswerPath = Path.Combine(dir, path.Substring(6,3) + ".h.most-voted.json");
        File.WriteAllText(highestScoreAnswerPath, JsonSerializer.SerializeToString(highestScoreAnswer));
    }
    
    writtenCount++;
}

db.ExecuteSql("ALTER TABLE post DROP COLUMN Body;");
db.ExecuteSql("VACUUM;");

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

    public List<string> Tags { get; set; }
    
    public string Body { get; set; }
    
    public string Slug { get; set; }

    public string Summary { get; set; }
}