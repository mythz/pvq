using System.Data;
using ServiceStack;
using ServiceStack.DataAnnotations;
using ServiceStack.OrmLite;
using ServiceStack.OrmLite.Legacy;
using ServiceStack.Text;

namespace meta;


public static class Regenerate
{
    static System.Text.Json.JsonSerializerOptions SystemJsonOptions = new(TextConfig.SystemJsonOptions)
    {
        WriteIndented = true
    };

    public static string ToJson<T>(T obj) => System.Text.Json.JsonSerializer.Serialize(obj, SystemJsonOptions);
    static T FromJson<T>(this string json) => System.Text.Json.JsonSerializer.Deserialize<T>(json, SystemJsonOptions);
    
    
    public static async Task<Meta> RegenerateMeta(this DirectoryInfo baseDir,Post post)
    {
        var now = DateTime.Now;
        var path = post.Id.ToString("000000000");
        var dir = Path.Combine($"{baseDir}", path.Substring(0,3), path.Substring(3,3));
        // Count all .h and .a files for this post
        var filePrefix = path.Substring(6, 3);
        var metaFile = Path.Join(baseDir.FullName,$"{filePrefix}.meta.json");
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
            meta = new() {};
        }
        
        var answerFiles = Directory.GetFiles(Path.Join(baseDir.FullName), $"{filePrefix}.a.*").ToList();
        var humanAnswerFiles = Directory.GetFiles(Path.Join(baseDir.FullName), $"{filePrefix}.h.*").ToList();
        answerFiles.AddRange(humanAnswerFiles);
        
        foreach (var answerFile in answerFiles)
        {
            var model = answerFile.GetAnswerUserName(filePrefix);
            if (!meta.ModelVotes.ContainsKey(model))
                meta.ModelVotes[model] = ModelScores.GetValueOrDefault(model, 0);
        }
        if (meta.Id == default)
            meta.Id = post.Id;
        meta.ModifiedDate = now;
        
        // Read in the `.v.` (votes) file for this post
        var votesFile = Path.Join(baseDir.FullName, $"{filePrefix}.v.json");
        var modelVotes = File.Exists(votesFile)
            ? (await File.ReadAllTextAsync(votesFile)).FromJson<Vote>().ModelVotes
            : new();

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
            },
        };
        
        
        foreach (var vote in modelVotes)
        {
            var answerId = postId + "-" + vote.Key;
            var answerModel = vote.Key;
            var answerStats = new StatTotals
            {
                Id = answerId,
                PostId = post.Id,
                UpVotes = 0,
                DownVotes = 0,
                StartingUpVotes = (int)Math.Round(vote.Value,0)
            };
            liveStats.Add(answerStats);
        }

        meta.StatTotals = liveStats;
        return meta;
    }
    
    private static string GetAnswerUserName(this string answerFileName, string fileId)
    {
        var modelName = answerFileName.Contains(".a.") ? answerFileName.RightPart(fileId + ".a.").SplitOnLast('.')[0]
            : answerFileName.RightPart(fileId + ".h.").SplitOnLast('.')[0];
        return modelName;
    }
    
    public static Dictionary<string,int> ModelScores = new()
    {
        ["phi"] = 1, //2.7B
        ["gemma:2b"] = 2,
        ["qwen:4b"] = 3, //4B
        ["codellama"] = 4, //7B
        ["gemma"] = 5, //7B
        ["deepseek-coder:6.7b"] = 5, //6.7B
        ["mistral"] = 7, //7B
        ["mixtral"] = 8, //47B
        ["accepted"] = 9,
        ["most-voted"] = 10,
    };
}

public class Vote
{
    public Dictionary<string, double> ModelVotes { get; set; } = [];
}

/// <summary>
/// Aggregate Stats for Questions(Id=PostId) and Answers(Id=PostId-UserName)
/// </summary>
public class StatTotals
{
    // PostId (Question) or PostId-UserName (Answer)
    public required string Id { get; set; }
    
    public int PostId { get; set; }
    
    public int FavoriteCount { get; set; }
    
    // post.ViewCount + Sum(PostView.PostId)
    public int ViewCount { get; set; }
    
    // Sum(Vote(PostId).Score > 0) 
    public int UpVotes { get; set; }
    
    // Sum(Vote(PostId).Score < 0) 
    public int DownVotes { get; set; }
    
    // post.Score || Meta.ModelVotes[PostId] (Model Ranking Score)
    public int StartingUpVotes { get; set; }

    public int GetScore() => StartingUpVotes + UpVotes - DownVotes;

    private sealed class StatTotalsEqualityComparer : IEqualityComparer<StatTotals>
    {
        public bool Equals(StatTotals x, StatTotals y)
        {
            if (ReferenceEquals(x, y)) return true;
            if (ReferenceEquals(x, null)) return false;
            if (ReferenceEquals(y, null)) return false;
            if (x.GetType() != y.GetType()) return false;
            return x.Id == y.Id && x.PostId == y.PostId && x.FavoriteCount == y.FavoriteCount && x.ViewCount == y.ViewCount && x.UpVotes == y.UpVotes && x.DownVotes == y.DownVotes && x.StartingUpVotes == y.StartingUpVotes;
        }

        public int GetHashCode(StatTotals obj)
        {
            return HashCode.Combine(obj.Id, obj.PostId, obj.FavoriteCount, obj.ViewCount, obj.UpVotes, obj.DownVotes, obj.StartingUpVotes);
        }
    }

    public static IEqualityComparer<StatTotals> StatTotalsComparer { get; } = new StatTotalsEqualityComparer();

    public bool Matches(StatTotals? other)
    {
        return other == null || UpVotes != other.UpVotes || DownVotes != other.DownVotes || StartingUpVotes != other.DownVotes;
    }
}

public class Meta
{
    // PostId
    public int Id { get; set; }

    // ModelName => Votes
    public Dictionary<string, double> ModelVotes { get; set; } = [];

    // Question + Answer Stats Totals
    public List<StatTotals> StatTotals { get; set; } = [];

    public DateTime ModifiedDate { get; set; }
}

[Alias("post")]
public class Post
{
    public int Id { get; set; }

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