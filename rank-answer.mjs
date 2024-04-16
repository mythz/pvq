#!/usr/bin/env node

import fs from "fs"
import path from "path"
import {
    useClient,
    useLogging,
    idParts,
    lastLeftPart,
    lastRightPart,
    openAiResponse,
    openAiFromModel
} from "./lib.mjs"

let answerPath = process.argv[2]
let model = process.argv[3]
let port = process.argv[4] ?? '11434'
if (!model) throw "model required"

if (!fs.existsSync(answerPath)) {
    console.log(`file does not exist: ${answerPath}`)
    process.exit()
}

const { logInfo, logDebug, logError } = useLogging()

// Check path of running script
const scriptPath = process.argv[1]
const scriptDir = path.dirname(scriptPath)
// Join scriptDir with './meta/' to get the meta directory
const metaDir = path.join(scriptDir, 'meta')
// Join scriptDir with './questions' to get the questions directory
const questionsDir = path.join(scriptDir, 'questions')

console.log("Starting...")
const answerJson = fs.readFileSync(answerPath, 'utf-8')
const answer = JSON.parse(answerJson)
const questionPath = lastLeftPart(answerPath, '.a.') + '.json'
console.log(questionPath)
const questionJson = fs.readFileSync(questionPath, 'utf-8')
const question = JSON.parse(questionJson)
const idDetails = idParts(question.id)
const id = question.id
const answerContent = answer.choices[0].message.content

// Ensure meta dir1 exists
const metaDir1 = path.join(metaDir, idDetails.dir1)
const metaDir2 = path.join(metaDir1, idDetails.dir2)
if (!fs.existsSync(metaDir1)) {
    fs.mkdirSync(metaDir1)
    fs.mkdirSync(metaDir2)
}

if (!fs.existsSync(metaDir2)) {
    fs.mkdirSync(metaDir2)
}

// Get model listed in answer file path
let answerModel = lastRightPart(lastLeftPart(answerPath, '.'), '.')

// Map the model to the consistent username
answerModel = openAiFromModel(answerModel)
model = openAiFromModel(model)

const outVotesPath = path.join(metaDir2, `${idDetails.fileId}.v.json`)
const outReasonsPath = path.join(metaDir2, `${idDetails.fileId}.reasons.${model}.json`)
const outValidationPath = path.join(metaDir2, `${idDetails.fileId}.validation.${answerModel}.${model}.json`)

const { openAi } = useClient()
const maxTokens = 1024
const temperature = 0.1
const expectedReasonsSchema = {
    "score": 1,
    "reason": "Your reason goes here. Above score is only an example."
}

let systemPrompt = { "role":"system", "content":"You are an AI assistant that votes on the quality and relevance of answers to a given question. Before giving votes, give an critique of each answer based on quality and relevance." }

let r = null
let startTime = performance.now()
let content = null;
try {

    content = `Below I have a user question and an answer to the user question. I want you to give a score out of 10 based on the quality in relation to the original user question. 
    
    ## Original User Question
    
    Title: ${question.title}
    Body:
    ${question.body}
    Tags: ${question.tags.join(', ')}
    ---
    
    Critique the below answer to justify your score, providing a brief explanation before returning the simple JSON object showing your score with your reasoning. Make sure you write out your explanation before voting.
    
    Think about the answer given in relation to the original user question. Use the tags to help you understand the context of the question.
    
    ## Answer Attempt
    
    ${answerContent}
    ---
    
    Now review and score the answer above out of 10.`
    content += `
    
    Concisely articulate what a good answer needs to contain and how the answer provided does or does not meet those criteria.
    
    - If the answer has mistakes or does not address all the question details, score it between 0-2. 
    - If the answer is correct, but could be improved, score it between 3-6. 
    - If the answer is correct and provides a good explanation, score it between 7-9.
    - If the answer is perfect and provides a clear and concise explanation, score it 10. 
    
    If in your reason to discover a mistake, adjust your JSON output score to reflect the mistake.
    Because these are coding questions, mistakes in the code are critical and should be scored lower. Look closely at the syntax and logic of the code for any mistakes. Missing mistakes in reviews leads to a failed review, and many answers are not correct.
    
    At the end of your response, return all your votes in a single JSON object in the following format:
    
    ${JSON.stringify(expectedReasonsSchema,null,4)}
    
    You must include a reason and vote for the answer provided, missing either will result in a failed review.
    You must include the JSON version of your vote and concise reason.
    Do not repeat the question or answer in your response.
    Do not try to fix the answer, only critique it.
    `

    logDebug(`=== REQUEST ${id} ===`)
    logDebug(`${id}, ${questionPath}`)
    logDebug(`=== END REQUEST ${id} ===\n\n`)

    let reqOptions = { content, model, port, systemPrompt, temperature, maxTokens }
    r = await openAi(reqOptions)
} catch (e) {
    console.log(e)
    logError(`Failed:`, e)
    process.exit()
}
let endTime = performance.now()
let elapsed_ms = parseInt(endTime - startTime)

logDebug(`=== RESPONSE ${id} in ${elapsed_ms}ms ===\n`)
const txt = await r.text()
const created = new Date().toISOString()

if (!r.ok) {
    console.log(`${r.status} request failed: ${txt}`)
    process.exit(1)
}

if(txt.length === 0) {
    logError(`Empty response from model: ${model}`)
    process.exit()
}

const res = openAiResponse(txt, model)
const responseContent = res?.choices?.length > 0 && res.choices[0].message?.content

// Extract the JSON from the text using regex
let structuredReasons = responseContent.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
if (structuredReasons == null || structuredReasons.length === 0) {
    logError(`No structured reasons found in response: ${responseContent}`);
    process.exit()
}

const isValid = structuredReasons[0].includes('score') && structuredReasons[0].includes('reason')
if (!isValid) {
    logError(`Invalid structured reasons found in response: ${responseContent}`);
    process.exit()
}

// Read current v.json
let votes = { modeVotes: {}}
if (fs.existsSync(outVotesPath)) {
    votes = JSON.parse(fs.readFileSync(outVotesPath, 'utf-8'))
}

logDebug(`JSON found ${structuredReasons.length}`)
logDebug(`=== STRUCTURED REASONS ===`)
logDebug(structuredReasons[0])
logDebug('=== END STRUCTURED REASONS ===\n\n')

fs.writeFileSync(outValidationPath, JSON.stringify({response: res, created, model, rawScores: structuredReasons[0]}))
let newVotes = JSON.parse(structuredReasons[0])
// Merge in new votes
votes.modelVotes[answerModel] = newVotes.score
fs.writeFileSync(outVotesPath, JSON.stringify(votes, null, 4))

// Merge in new reasons
let reasons = {}
if (fs.existsSync(outReasonsPath)) {
    reasons = JSON.parse(fs.readFileSync(outReasonsPath, 'utf-8'))
}
reasons[answerModel] = newVotes

// Write updated reasons
fs.writeFileSync(outReasonsPath, JSON.stringify(reasons, null, 4))

// Done
logDebug(`Wrote ${outVotesPath}`)
logDebug(`Wrote ${outReasonsPath}`)
logDebug(`Wrote ${outValidationPath}`)
process.exit(0)