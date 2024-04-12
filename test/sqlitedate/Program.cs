using System.Linq;
using ServiceStack;
using ServiceStack.Text;
using ServiceStack.OrmLite;

var dateConverter = SqliteDialect.Provider.GetDateTimeConverter();
dateConverter.DateStyle = DateTimeKind.Utc;

var dbFactory = new OrmLiteConnectionFactory("test.db", SqliteDialect.Provider);
using var db = dbFactory.Open();
db.DropAndCreateTable<DateModel>();

var utc = DateTime.UtcNow;
var local = DateTime.Now;
var unspecified = DateTime.SpecifyKind(DateTime.Now, DateTimeKind.Unspecified);

var model = new DateModel {
    Id = 1,
    Utc = utc,
    Local = local,
    Unspecified = unspecified,
};

db.Insert(model);

var fromDb = db.SingleById<DateModel>(model.Id);

Console.WriteLine($"Utc: {utc} => {fromDb.Utc} ({fromDb.Utc.Kind})");
Console.WriteLine($"Local: {utc} => {fromDb.Local} ({fromDb.Local.Kind})");
Console.WriteLine($"Unspecified: {unspecified} => {fromDb.Unspecified} ({fromDb.Unspecified.Kind})");

public class DateModel
{
    public int Id { get; set; }
    public DateTime Utc { get; set; }
    public DateTime Local { get; set; }
    public DateTime Unspecified { get; set; }
}

