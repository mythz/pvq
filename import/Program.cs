using ServiceStack;
using ServiceStack.Text;
using ServiceStack.OrmLite;
using ServiceStack.DataAnnotations;

if (File.Exists("../questions/app.db")) File.Delete("../questions/app.db");
File.Copy("../questions/filtered.db", "../questions/app.db");

var dbFactory = new OrmLiteConnectionFactory("../questions/app.db", SqliteDialect.Provider);

using var db = dbFactory.Open();
db.ExecuteSql("UPDATE posts SET Tags = REPLACE(Tags, '|', ',')");
db.ExecuteSql("ALTER TABLE posts ADD COLUMN Slug TEXT");
db.ExecuteSql("ALTER TABLE posts ADD COLUMN Summary TEXT");
db.ExecuteSql("ALTER TABLE posts RENAME TO post");

var i = 0;
foreach(string f in Directory.EnumerateFiles("../questions", "*.json", SearchOption.AllDirectories)
    .Where(x => x.LastRightPart('/').Length == "000.json".Length))
{
    if (i++ % 100 == 0) Console.WriteLine(i + ": " + f);
    var json = f.ReadAllText();
    try {
        var post = (Dictionary<string,object>)JSON.parse(json)!;
        var id = (int)post["Id"];
        var title = (string)post["Title"];
        var body = ((string)post["Body"]).StripHtml().Replace("```"," ");

        var slug = title.GenerateSlug(maxLength:200);
        var summary = body.SubstringWithEllipsis(0, 200);

        db.UpdateOnly(() => new Post {
            Slug = slug,
            Summary = summary,
        }, where:x => x.Id == id);
    } 
    catch(Exception e)
    {
        Console.WriteLine($"Failed: {f}: {e.Message}");
        Console.WriteLine(json);
        //select id, tags, slug, summary from post where id = 24797485;
    }
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