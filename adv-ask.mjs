import fs from "fs"
import path from "path"
import processFile from "./apply-meta-template.mjs"
import askOllama from "./ollama.mjs"
import loadEnv from "./load-env.mjs";

// Check if the required arguments are provided, eg questionFile and model
if (process.argv.length !== 4) {
    console.error('Usage: node gen-ask.mjs <question_file> <model>');
    process.exit(1);
}

loadEnv();

// Get the input file and model from the command-line arguments
const questionFile = process.argv[2];
const model = process.argv[3];

const dir = path.dirname(questionFile)
console.log(dir)

const metaTemplateFile = path.join('./prompts', 'meta-1.txt');

// Replace the placeholders with the values from the question file
const advancedQuestionMetaPrompt = processFile(metaTemplateFile, questionFile);

// Call ollama to generate the advanced question prompt
let r = null
try {
    r = await askOllama('You are a helpful AI assistant.',advancedQuestionMetaPrompt, model, 0.7, 1024, 'groq');
} catch (e) {
    console.error(e);
    process.exit(1);
}
const res = await r.json()
console.log(res);
let advPrompt = res.choices[0].message.content.trim()

// Write the advanced prompt to a file
const advancedPromptFile = path.join(dir,`${path.parse(questionFile).name}.adv.prompt.json`);
fs.writeFileSync(advancedPromptFile, JSON.stringify({ prompt: advPrompt }, null, 4));

console.log(`Advanced prompt generated and saved to ${advancedPromptFile}`);

// Take that advanced prompt and generate a response
// Call ollama to generate the advanced question prompt
let r2 = null
try {
    r2 = await askOllama('You are a helpful AI assistant.',advPrompt, model, 0.7, 1024,'groq');
} catch (e) {
    console.error(e);
    process.exit(1);
}
const res2 = await r2.json()
let advResponse = res2.choices[0].message.content.trim()

// Write the advanced response to a file
const advancedResponseFile = path.join(dir,`${path.parse(questionFile).name}.adv-answer.json`);
fs.writeFileSync(advancedResponseFile, JSON.stringify({ answer: advResponse }, null, 4));

console.log(`Advanced response generated and saved to ${advancedResponseFile}`);





