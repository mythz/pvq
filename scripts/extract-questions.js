const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Connect to the SQLite database
const db = new sqlite3.Database('../data/filtered.db');

db.exec('ALTER TABLE posts ADD COLUMN Summary TEXT');
db.exec('ALTER TABLE posts ADD COLUMN Slug TEXT');
db.exec('ALTER TABLE posts RENAME TO post');

// Create a queue to store the database operations
const operationQueue = [];
let isProcessing = false;

// Function to process the next operation in the queue
function processNextOperation() {
    if (isProcessing || operationQueue.length === 0) {
        return;
    }

    isProcessing = true;
    const operation = operationQueue.shift();
    operation(err => {
        if (err) {
            console.error('Error executing operation:', err);
        }
        isProcessing = false;
        processNextOperation();
    });
}

// Function to add an operation to the queue
function queueOperation(operation) {
    operationQueue.push(operation);
    processNextOperation();
}

// Counter to keep track of processed rows
let processedRows = 0;

// Execute a SELECT query to retrieve data from the table
db.each('SELECT * FROM post', (err, row) => {
    if (err) {
        console.error(err);
        return;
    }

    if (processedRows % 1000 === 0) {
        console.log('Processing row', processedRows);
    }

    // Generate a slug from the title
    const slug = generateSlug(row.Title, 200);
    // Strip html from the body to prep summary
    let summary = row.Body.replace(/<[^>]+>/g, '');
    summary = summary.substring(0, Math.min(summary.length, 200)).trim() + (summary.length > 200 ? '...' : '');

    // Add database update operations to the queue
    queueOperation(done => {
        db.run('UPDATE post SET Slug = ?, Summary = ? WHERE Id = ?', [slug, summary, row.Id], err => {
            if (err) {
                console.error('Error updating database:', err);
            }
            done();
        });
    });

    row.Summary = summary;
    row.Slug = slug;

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
        db.close();
    }
});

export function generateSlug(phrase, maxLength=100) {
    let str = phrase
    if (!str) return ''
    str = str.toLowerCase()
        .replace(/["'`?#]/g,'')
        .replace(/\+\+/g, 'pp')

    str = str.replace(/[^\u0000-\u007F]+/g, '')
    str = str.replace(/[^a-z0-9\s-]/g, '-')
    str = str.substring(0, Math.min(str.length, maxLength)).trim()
    str = str.replace(/\s+/g, '-')
    str = str.replace(/-+/g, '-')

    if (str[0] === '-')
        str = str.substring(1)
    if (str.length > 0 && str[str.length-1] === '-')
        str = str.substring(0, str.length-1)
    return str
}