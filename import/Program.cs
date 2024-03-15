using ServiceStack;
using ServiceStack.Text;
using ServiceStack.OrmLite;
using ServiceStack.DataAnnotations;

if (File.Exists("../questions/app.db")) File.Delete("../questions/app.db");
File.Copy("../data/filtered.db", "../questions/app.db");

var dbFactory = new OrmLiteConnectionFactory("../questions/app.db", SqliteDialect.Provider);

using var db = dbFactory.Open();

Console.WriteLine("Fetching Posts...");
var allPosts = db.Select<Post>();
Console.WriteLine($"Fetched {allPosts.Count} Posts");
int processedCount = 0;
foreach(var post in allPosts)
{
    if (processedCount % 1000 == 0)
    {
        Console.WriteLine($"Processed {processedCount} Posts");
    }
    try {
        // Populate Summary and Slug
        if (post.Summary == null || post.Slug == null)
        {
            var body = post.Title + " " + post.ContentLicense;
            var slug = post.Title.GenerateSlug(maxLength:200);
            var summary = body.SubstringWithEllipsis(0, 200);
            post.Summary = summary;
            post.Slug = slug;
        }
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
    writtenCount++;
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

    public List<string> Tags { get; set; }
    
    public string Slug { get; set; }

    public string Summary { get; set; }
}