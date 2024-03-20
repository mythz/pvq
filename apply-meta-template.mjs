import fs from "fs";
import path from "path";

function processFile(inputFile, jsonFile) {
    // Read the JSON file
    const jsonData = fs.readFileSync(jsonFile, 'utf8');
    const data = JSON.parse(jsonData);

    // Extract the values from the JSON object
    const { Title, Tags, Body } = data;

    // Read the input file
    const inputText = fs.readFileSync(inputFile, 'utf8');

    // Replace the placeholders with the values from the JSON object
    const outputText = inputText
        .replace(/\$\${Title}\$\$/g, Title)
        .replace(/\$\${Tags}\$\$/g, Tags)
        .replace(/\$\${Body}\$\$/g, Body);

    return outputText;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    // Check if the required arguments are provided
    if (process.argv.length !== 4) {
        console.error('Usage: node script.js <input_file> <json_file>');
        process.exit(1);
    }

    // Get the input file and JSON file from the command-line arguments
    const inputFile = process.argv[2];
    const jsonFile = process.argv[3];

    // Generate the output file name
    const outputFile = `${path.parse(jsonFile).name}.prompt.json`;

    // Call the processFile function
    const outputText = processFile(inputFile, jsonFile);

    // Write the output to the output file
    fs.writeFileSync(outputFile, outputText);

    console.log(`Replacement complete. Output saved to ${outputFile}`);
}

export default processFile;