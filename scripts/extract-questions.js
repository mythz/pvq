const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Connect to the SQLite database
const db = new sqlite3.Database('../data/filtered.db');

// Counter to keep track of processed rows
let processedRows = 0;

// Execute a SELECT query to retrieve data from the table
db.each('SELECT * FROM posts', (err, row) => {
    if (err) {
        console.error(err);
        return;
    }

    // Get the ID value from the row
    const id = row.Id.toString().padStart(9, '0');

    // Split the ID into three parts
    const part1 = id.slice(0, 3);
    const part2 = id.slice(3, 6);
    const part3 = id.slice(6);

    // Construct the file path
    const outputDir = path.join('../questions', part1, part2);

    // Create the folder structure if it doesn't exist
    fs.mkdirSync(outputDir, { recursive: true });

    // Write each row as an object to a file
    const outputFile = path.join(outputDir, `${part3}.json`);
    fs.writeFile(outputFile, JSON.stringify(row, null, 2), (err) => {
        if (err) {
            console.error(err);
        }
        processedRows++;
        if (processedRows === db.total) {
            console.log('All rows processed successfully.');
            db.close();
        }
    });
}, (err) => {
    if (err) {
        console.error(err);

    }
    db.close();
});