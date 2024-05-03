using System.Linq;
using System.IO;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using ServiceStack;
using ServiceStack.Text;
using ServiceStack.Data;
using ServiceStack.DataAnnotations;
using ServiceStack.OrmLite;
using MyApp.Data;
using MyApp.ServiceInterface.App;
using MyApp.ServiceModel;

var allTagsFile = new FileInfo(Path.GetFullPath("../dist/tags.txt"));

var appConfig = new AppConfig();
appConfig.LoadTags(allTagsFile);


Console.WriteLine($"Loaded {appConfig.AllTags.Count} tags");

RedditTest[] RedditTests =
[
    new RedditTest(
        "https://www.reddit.com/r/dotnet/comments/1byolum/all_the_net_tech_i_use_what_else_is_out_there/",
        "All the .NET tech I use. What else is out there that is a must-have?",
        "Sitting here tonight writing down everything in my technical stack",
        [".net", "stack", "bit", "dump", "oop"],
        "reddit.dotnet:1byolum"
    ),
    new RedditTest(
        "https://www.reddit.com/r/dotnet/comments/1cfr36q/rpc_calls_state_of_the_art/",
        "RPC calls - state of the art",
        "Hi",
        [".net", "database", "client", ".net", "odbc"],
        "reddit.dotnet:1cfr36q"
    )
];

var command = new ImportQuestionCommand(new NullLogger<ImportQuestionCommand>(), appConfig);
foreach (var reddit in RedditTests)
{
    await command.ExecuteAsync(new ImportQuestion
    {
        Site = ImportSite.Reddit,
        Url = reddit.Url,
    });

    var result = command.Result!;
    result.PrintDump();
}

record RedditTest(string Url, string Title, string BodyPrefix, string[] Tags, string RefUrn);
