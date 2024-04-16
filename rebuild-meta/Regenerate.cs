using ServiceStack;
using ServiceStack.DataAnnotations;
using ServiceStack.Text;

namespace meta;

public static class Regenerate
{
    static System.Text.Json.JsonSerializerOptions SystemJsonOptions = new(TextConfig.SystemJsonOptions)
    {
        WriteIndented = true
    };

    public static string ToJson<T>(T obj) => System.Text.Json.JsonSerializer.Serialize(obj, SystemJsonOptions);
    static T FromJson<T>(this string json) => System.Text.Json.JsonSerializer.Deserialize<T>(json, SystemJsonOptions)!;

    public static async Task<Meta?> RegenerateMeta(this DirectoryInfo baseDir, Post post)
    {
        var now = DateTime.Now;
        var path = post.Id.ToString("000000000");
        var dir = Path.Combine($"{baseDir}", path.Substring(0, 3), path.Substring(3, 3));
        // Count all .h and .a files for this post
        var filePrefix = path.Substring(6, 3);
        var metaFile = Path.Join(baseDir.FullName, $"{filePrefix}.meta.json");
        var postId = $"{post.Id}";

        Meta meta;
        if (File.Exists(metaFile))
        {
            try
            {
                meta = (await File.ReadAllTextAsync(metaFile)).FromJson<Meta>();
            }
            catch (Exception e)
            {
                Console.WriteLine($"Error reading {metaFile}: {e.Message}");
                throw;
            }
        }
        else
        {
            meta = new() { };
        }

        var answerFiles = Directory.GetFiles(Path.Join(baseDir.FullName), $"{filePrefix}.a.*").ToList();
        var humanAnswerFiles = Directory.GetFiles(Path.Join(baseDir.FullName), $"{filePrefix}.h.*").ToList();
        answerFiles.AddRange(humanAnswerFiles);

        if (meta.Id == default)
            meta.Id = post.Id;
        meta.ModifiedDate = now;

        // Read in the `.v.` (votes) file for this post
        var metaPath = baseDir.FullName.Replace("/questions/", "/meta/");
        var votesFile = Path.Join(metaPath, $"{filePrefix}.v.json");
        var modelVotesExists = File.Exists(votesFile);
        var modelVote = new Vote { ModelVotes = new() };
        try
        {
            if (modelVotesExists)
            {
                var votesJson = await File.ReadAllTextAsync(votesFile);
                modelVote = votesJson.FromJson<Vote>();
            }
        }
        catch (Exception e)
        {
            Console.WriteLine($"Error reading votes file {votesFile} : {e.Message}\n...");
        }

        meta.ModelVotes = modelVote.ModelVotes;
        meta.ModelReasons = modelVote.ModelReasons;
        meta.GradedBy = modelVote.GradedBy;

        // Question
        var liveStats = new List<StatTotals>
        {
            new()
            {
                Id = postId,
                PostId = post.Id,
                ViewCount = 0,
                FavoriteCount = 0,
                StartingUpVotes = post.Score,
                UpVotes = 0,
                DownVotes = 0,
                CreatedBy = "stackoverflow"
            },
        };

        foreach (var vote in modelVote.ModelVotes)
        {
            var answerId = postId + "-" + vote.Key;
            var answerStats = new StatTotals
            {
                Id = answerId,
                PostId = post.Id,
                UpVotes = 0,
                DownVotes = 0,
                StartingUpVotes = vote.Value,
                CreatedBy = vote.Key
            };
            liveStats.Add(answerStats);
        }

        meta.StatTotals = liveStats;
        meta.ModelVotes = modelVote.ModelVotes;
        meta.ModelReasons = modelVote.ModelReasons;

        return meta;
    }

    private static string GetAnswerUserName(this string answerFileName, string fileId)
    {
        var modelName = answerFileName.Contains(".a.")
            ? answerFileName.RightPart(fileId + ".a.").SplitOnLast('.')[0]
            : answerFileName.RightPart(fileId + ".h.").SplitOnLast('.')[0];
        modelName = ModelUserNameFixes.GetValueOrDefault(modelName, modelName);
        return modelName;
    }

    public static Dictionary<string, string> ModelUserNameFixes { get; } = new()
    {
        { "deepseek-coder-6.7b", "deepseek-coder" },
        { "deepseek-coder-6", "deepseek-coder" },
    };

    public static Dictionary<string, int> ModelScores = new()
    {
        ["phi"] = 1, //2.7B
        ["gemma:2b"] = 2,
        ["qwen:4b"] = 3, //4B
        ["codellama"] = 4, //7B
        ["gemma"] = 5, //7B
        ["deepseek-coder:6.7b"] = 5, //6.7B
        ["deepseek-coder:33b"] = 6, //33B
        ["mistral"] = 7, //7B
        ["mixtral"] = 8, //47B
        ["accepted"] = 9,
        ["most-voted"] = 10,
    };
}

public class Vote
{
    // Model (UserName) => Votes
    public Dictionary<string, int> ModelVotes { get; set; } = [];

    // Model (UserName) => Vote Reason
    public Dictionary<string, string> ModelReasons { get; set; } = [];

    // "gradedBy": { "mixtral": ["1000-mistral","1000-gemma",..] }
    public Dictionary<string, Dictionary<string, List<string>>> GradedBy { get; set; } = [];
}

public class VoteReason
{
    public double Score { get; set; }
    public string Reason { get; set; }
}

/// <summary>
/// Aggregate Stats for Questions(Id=PostId) and Answers(Id=PostId-UserName)
/// </summary>
public class StatTotals
{
    // PostId (Question) or PostId-UserName (Answer)
    [PrimaryKey] public required string Id { get; set; }

    [Index] public int PostId { get; set; }

    public int FavoriteCount { get; set; }

    // post.ViewCount + Sum(PostView.PostId)
    public int ViewCount { get; set; }

    // Sum(Vote(PostId).Score > 0) 
    public int UpVotes { get; set; }

    // Sum(Vote(PostId).Score < 0) 
    public int DownVotes { get; set; }

    // post.Score || Meta.ModelVotes[PostId] (Model Ranking Score)
    public int StartingUpVotes { get; set; }

    [Index] [StringLength(128)] public string? CreatedBy { get; set; }

    public int GetScore() => StartingUpVotes + UpVotes - DownVotes;

    private sealed class StatTotalsEqualityComparer : IEqualityComparer<StatTotals>
    {
        public bool Equals(StatTotals x, StatTotals y)
        {
            if (ReferenceEquals(x, y)) return true;
            if (ReferenceEquals(x, null)) return false;
            if (ReferenceEquals(y, null)) return false;
            if (x.GetType() != y.GetType()) return false;
            return x.Id == y.Id && x.PostId == y.PostId && x.FavoriteCount == y.FavoriteCount &&
                   x.ViewCount == y.ViewCount && x.UpVotes == y.UpVotes && x.DownVotes == y.DownVotes &&
                   x.StartingUpVotes == y.StartingUpVotes;
        }

        public int GetHashCode(StatTotals obj)
        {
            return HashCode.Combine(obj.Id, obj.PostId, obj.FavoriteCount, obj.ViewCount, obj.UpVotes, obj.DownVotes,
                obj.StartingUpVotes);
        }
    }

    public static IEqualityComparer<StatTotals> StatTotalsComparer { get; } = new StatTotalsEqualityComparer();

    public bool Matches(StatTotals? other)
    {
        return other == null || UpVotes != other.UpVotes || DownVotes != other.DownVotes ||
               StartingUpVotes != other.DownVotes;
    }
}

// AnswerId = `{PostId}-{UserName}`
// RefId = PostId | AnswerId
public class Meta
{
    // PostId
    public int Id { get; set; }

    // Model (UserName) => Votes
    public Dictionary<string, int> ModelVotes { get; set; } = [];

    // Model (UserName) => Vote Reason
    public Dictionary<string, string> ModelReasons { get; set; } = [];

    // "gradedBy": { "mixtral": ["1000-mistral","1000-gemma",..] }
    public Dictionary<string, Dictionary<string, List<string>>> GradedBy { get; set; } = [];

    // RefId => Comments
    public Dictionary<string, List<Comment>> Comments { get; set; } = [];

    // Question + Answer Stats Totals
    public List<StatTotals> StatTotals { get; set; } = [];

    public DateTime ModifiedDate { get; set; }
}

public class Comment
{
    public string Body { get; set; }
    public long Created { get; set; } //timestamp ms 
    public string CreatedBy { get; set; }
    public int? UpVotes { get; set; }
    public int? Reports { get; set; }
}

[Alias("post")]
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

    public List<string> Tags { get; set; }

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
}