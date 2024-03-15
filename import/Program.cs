using ServiceStack;
using ServiceStack.Text;
using ServiceStack.OrmLite;
using ServiceStack.DataAnnotations;

if (File.Exists("../questions/app.db")) File.Delete("../questions/app.db");
File.Copy("../data/filtered.db", "../questions/app.db");

var dbFactory = new OrmLiteConnectionFactory("../questions/app.db", SqliteDialect.Provider);

using var db = dbFactory.Open();

var allPosts = db.Select<Post>();
foreach(var post in allPosts)
{
    try {
        // Populate Summary and Slug
        if (post.Summary == null || post.Slug == null)
        {
            var body = post.Title + " " + post.ContentLicense;
            var slug = post.Title.GenerateSlug(maxLength:200);
            var summary = body.SubstringWithEllipsis(0, 200);
            db.UpdateOnly(() => new Post {
                Slug = slug,
                Summary = summary,
            }, where:x => x.Id == post.Id);
        }
    }
    catch(Exception e)
    {
        Console.WriteLine($"Failed {post.Id}: {e.Message}");
        Console.WriteLine(post.ToJson());
        //select id, tags, slug, summary from post where id = 24797485;
    }
}

var updatedPosts = db.Select<Post>();

//Write files to ./questions/???/???/???.json where path is the padded nine 0s of the Id
foreach(var post in updatedPosts)
{
    var path = post.Id.ToString("000000000");
    var dir = Path.Combine("../questions", path.Substring(0,3), path.Substring(3,3));
    Directory.CreateDirectory(dir);
    var json = JsonSerializer.SerializeToString(post);
    File.WriteAllText(Path.Combine(dir, path.Substring(6,3) + ".json"), json);
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