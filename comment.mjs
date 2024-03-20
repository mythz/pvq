import fs from "fs"
import path from "path"
import askOllama from "./ollama.mjs"
import processFile from "./apply-meta-template.mjs"

// Check if the required arguments are provided, eg questionFile and model
if (process.argv.length !== 4) {
    console.error('Usage: node comment.mjs <question_file> <model>');
    process.exit(1);
}

// Get the input file and model from the command-line arguments
const questionFile = process.argv[2];
const model = process.argv[3];

const dir = path.dirname(questionFile)
console.log(dir)

const commentTemplateFile = path.join('./prompts', 'comment-1.txt');

// Replace the placeholders with the values from the question file
const commentPrompt = processFile(commentTemplateFile, questionFile);

let r = null
try {
    r = await askOllama('You are a helpful AI assistant.',commentPrompt, model, 11435, 0.7, 1024, 'https://api.groq.com/openai');
} catch (e) {
    console.error(e);
    process.exit(1);
}
const res = await r.json()
console.log(res);
let commentResponse = res.choices[0].message.content.trim()

// Write the advanced prompt to a file
const commentResultFile = path.join(dir,`${path.parse(questionFile).name}.comment.json`);
let val = {comments:[{body: commentResponse, createdBy: model, createdDate: new Date().toISOString()}]};
fs.writeFileSync(commentResultFile, JSON.stringify(val, null, 4));

console.log(`Comment saved to ${commentResultFile}`);
