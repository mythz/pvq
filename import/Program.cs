using System.Data;
using System.Diagnostics;
using ServiceStack;
using ServiceStack.Text;
using ServiceStack.OrmLite;
using ServiceStack.DataAnnotations;

// Check if running as debug or not
var isDebug =  Debugger.IsAttached;
var basePath = isDebug ? "../../../../questions" : "../questions";
var baseDataPath = isDebug ? "../../../../data" : "../data";
var distPath = isDebug ? "../../../../dist" : "../dist";

System.Text.Json.JsonSerializerOptions SystemJsonOptions = new(TextConfig.SystemJsonOptions)
{
    WriteIndented = true
};

string ToJson<T>(T obj) => System.Text.Json.JsonSerializer.Serialize(obj, SystemJsonOptions);

if (File.Exists($"{distPath}/app.db".MapProjectPath())) File.Delete($"{distPath}/app.db".MapProjectPath());
File.Copy($"{baseDataPath}/filtered.db".MapProjectPath(), $"{distPath}/app.db".MapProjectPath());

var dbFactory = new OrmLiteConnectionFactory($"{distPath}/app.db".MapProjectPath(), SqliteDialect.Provider);

using var db = dbFactory.Open();

Console.WriteLine("Fetching Posts...");
var allPosts = db.Select<Post>();
var allPostIds = allPosts.ConvertAll(x => x.Id);
var allAcceptedAnswerIds = allPosts.ConvertAll(x => x.AcceptedAnswerId)
    .Where(x => x.HasValue).Select(x => x.Value).ToList();


// origDb.Select<Post>(q => Sql.In(q.Id, allPostIds)); produces a SQL error, build the query manually

var serializedHighestScoreAnswersMapExists = File.Exists(Path.Join(baseDataPath, "highest-score-answers.json"));
Dictionary<int?, Post> highestScoreAnswerMap;
List<Post>? highestScoreAnswers;
OrmLiteConnectionFactory? dbFactoryOriginal;
IDbConnection? origDb;
if(serializedHighestScoreAnswersMapExists)
{
    Console.WriteLine("Reading Highest voted answers from cached json...");
    var highestScoreAnswersJson = await File.ReadAllTextAsync(Path.Join(baseDataPath, "highest-score-answers.json"));
    highestScoreAnswers = highestScoreAnswersJson.FromJson<List<Post>>();
    highestScoreAnswerMap = highestScoreAnswers.ToDictionary(x => x.ParentId, x => x);
}
else
{
    Console.WriteLine("Selecting Posts from Original DB...");
    dbFactoryOriginal = new OrmLiteConnectionFactory($"{baseDataPath}/stackoverflow_posts.db".MapProjectPath(), SqliteDialect.Provider);
    origDb = dbFactoryOriginal.Open();
    Console.WriteLine("Selecting Highest voted answers from Original DB...");
    // Create a map of highest scoring answers to question posts, using HAVING MAX(score) to group by parentid
    var highestScoreAnswerSql = $"select * from posts where parentid in ({string.Join(",", allPostIds)}) and posttypeid = 2 group by parentid having max(score)";
    highestScoreAnswers = origDb.Select<Post>(highestScoreAnswerSql);
    highestScoreAnswerMap = highestScoreAnswers.ToDictionary(x => x.ParentId, x => x);

    await File.WriteAllTextAsync(Path.Join(baseDataPath, "highest-score-answers.json"), highestScoreAnswers.ToJson());
}

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
        var path = post.Id.ToString("000000000");
        var dir = Path.Combine($"{basePath}", path.Substring(0,3), path.Substring(3,3));
        // Count all .h and .a files for this post
        var filePrefix = path.Substring(6, 3);

        var allFiles = Directory.GetFiles(dir, "*.*", SearchOption.AllDirectories);
        var allAnswerFilesCount = allFiles.Count(x => x.Contains($"{filePrefix}.a."));
        allAnswerFilesCount += highestScoreAnswerMap.ContainsKey(post.Id) ? 1 : 0;
        post.Summary = summary;
        post.Slug = slug;
        post.AnswerCount = allAnswerFilesCount;
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

if(args.Contains("--skip-files")) return;

var acceptedAnswerSql = $"select * from posts where id in ({string.Join(",", allAcceptedAnswerIds)})";
dbFactoryOriginal = new OrmLiteConnectionFactory($"{baseDataPath}/stackoverflow_posts.db".MapProjectPath(), SqliteDialect.Provider);
origDb = dbFactoryOriginal.Open();
var acceptedAnswers = origDb.Select<Post>(acceptedAnswerSql);

// Create a map of accepted answers to question posts
var acceptedAnswerMap = acceptedAnswers.ToDictionary(x => x.ParentId, x => x);

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
    var dir = Path.Combine($"{basePath}", path.Substring(0,3), path.Substring(3,3));
    Directory.CreateDirectory(dir);
    var json = ToJson(post);
    File.WriteAllText(Path.Combine(dir, path.Substring(6,3) + ".json"), json);
    
    //Write the accepted answer if it exists
    if (acceptedAnswerMap.TryGetValue(post.Id, out var acceptedAnswer))
    {
        var acceptedAnswerPath = Path.Combine(dir, path.Substring(6,3) + ".h.accepted.json");
        File.WriteAllText(acceptedAnswerPath, ToJson(acceptedAnswer));
    }
    
    //Write the highest scoring answer if it exists
    if (highestScoreAnswerMap.TryGetValue(post.Id, out var highestScoreAnswer))
    {
        var highestScoreAnswerPath = Path.Combine(dir, path.Substring(6,3) + ".h.most-voted.json");
        File.WriteAllText(highestScoreAnswerPath, ToJson(highestScoreAnswer));
    }
    
    writtenCount++;
}

db.ExecuteSql("ALTER TABLE post DROP COLUMN Body;");
db.ExecuteSql("ALTER TABLE post DROP COLUMN ContentLicense;");
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

    public int? AnswerCount { get; set; }

    public DateTime? RankDate { get; set; }
}