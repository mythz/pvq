using System.Diagnostics;
using meta;
using ServiceStack;
using ServiceStack.OrmLite;

// Check if running as debug or not

var isDebug = Debugger.IsAttached;
var workingDir = Directory.GetCurrentDirectory();
var workingDirInfo = new DirectoryInfo(workingDir);
Console.WriteLine($"Working from {workingDirInfo.FullName}");
if (workingDirInfo.FullName.Contains("bin/Debug"))
{
    Console.WriteLine("Running from debug folder, setting isDebug to true");
    isDebug = true;
}

var basePath = isDebug ? "../../../../questions" : "../questions";
var distPath = basePath.LastLeftPart('/') + "/dist";
// var baseDataPath = isDebug ? "../../../../data" : "../data";

var appDbPathDir = new DirectoryInfo($"{distPath}/app.db");
var appDbPath = appDbPathDir.FullName;

Console.WriteLine($"Loading app.db from {appDbPath}");

// Make a copy of the app.db file before we start modifying it
if (File.Exists(appDbPath.MapProjectPath()))
{
    File.Copy(appDbPath, $"{appDbPath}.bak", overwrite: true);
}

var dbFactory = new OrmLiteConnectionFactory(appDbPath.MapProjectPath(), SqliteDialect.Provider);

// Here we are starting with the app.db that is populated with questions, but no StatTotals information
// We need to read `.v.` (votes) and `.a.` (model answers), as well as `.h.` (human answers) to populate the StatTotals table
// These files are all in the questions folder (basePath), so we need to recursively read all the required files,
// matching them to Post.Id.
using var db = dbFactory.Open();

var allPosts = db.Select<Post>();

int errorCount = 0;

// Iterate over all posts and populate the StatTotals using the RegenerateMeta extension method
List<Meta> allMeta = new();
foreach (var post in allPosts)
{
    var postDir = post.Id.ToString("000000000");
    var postDirPath = Path.Combine(basePath, postDir.Substring(0, 3), postDir.Substring(3, 3));
    var postDirInfo = new DirectoryInfo(postDirPath);
    if (!postDirInfo.Exists)
    {
        Console.WriteLine($"Post {post.Id} has no directory at {postDirPath}");
        continue;
    }

    try
    {
        var meta = await postDirInfo.RegenerateMeta(post);
        if (meta == null)
            continue;
        allMeta.Add(meta);
    }
    catch (Exception e)
    {
        Console.WriteLine($"Error processing post {post.Id}, skipping...");
        errorCount++;
    }
}

if (errorCount > 0)
{
    Console.WriteLine($"Errors processing {errorCount} posts, exiting...");
}

var allStatTotals = allMeta.SelectMany(x => x.StatTotals).ToList();

// Check for duplicate Ids in the StatTotals
var duplicateStatTotals = allStatTotals.GroupBy(x => x.Id).Where(g => g.Count() > 1).ToList();
if (duplicateStatTotals.Count > 0)
{
    Console.WriteLine($"Duplicate StatTotals found: {duplicateStatTotals.Count}");
    foreach (var duplicate in duplicateStatTotals)
    {
        Console.WriteLine($"Duplicate Id: {duplicate.Key}");
    }
}

if (duplicateStatTotals.Count > 0)
{
    Console.WriteLine("Exiting due to duplicate StatTotals");
    return;
}

// Set CreatedBy to 'stackoverflow' for all StatTotals missing CreatedBy
foreach (var statTotal in allStatTotals.Where(x => x.CreatedBy == null))
{
    statTotal.CreatedBy = "stackoverflow";
}

db.CreateTableIfNotExists<StatTotals>();
db.InsertAll(allStatTotals);

Console.WriteLine($"Inserted {allStatTotals.Count} StatTotals records");

int updatedMetaCount = 0;
// Write all meta files to ./questions/???/???/???.meta.json
foreach (var meta in allMeta)
{
    var paddedId = meta.Id.ToString("000000000");
    var questionDir = Path.Combine(basePath, paddedId.Substring(0, 3), paddedId.Substring(3, 3));
    questionDir.AssertDir();
    var metaPath = Path.Combine(questionDir, $"{paddedId.Substring(6, 3)}.meta.json");

    await File.WriteAllTextAsync(metaPath, Regenerate.ToJson(meta));
    updatedMetaCount++;
}

Console.WriteLine($"Updated {updatedMetaCount} meta files");