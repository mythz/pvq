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
    openAiFromModel,
    emptyVFile,
} from "./lib.mjs"

let answerPath = process.argv[2]
let model = process.argv[3]
let port = process.argv[4] ?? '11434'
if (!model) throw "model required"

if (!fs.existsSync(answerPath)) {
    console.log(`file does not exist: ${answerPath}`)
    process.exit()
}

// Ensure answer file
if (answerPath.indexOf('.a.') === -1) {
    console.log(`file is not an answer file: ${answerPath}`)
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

const answerJson = fs.readFileSync(answerPath, 'utf-8')
const answer = JSON.parse(answerJson)

// Guard against failing if question file of answer doesn't exist
const questionPath = lastLeftPart(answerPath, '.a.') + '.json'
if (!fs.existsSync(questionPath)) {
    console.log(`question file does not exist: ${questionPath}`)
    process.exit()
}

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
let answerModel = lastLeftPart(lastRightPart(answerPath, '/').substring('000.a.'.length), '.')
const answerId = `${id}-${answerModel}`

// Map the model to the consistent username
answerModel = openAiFromModel(answerModel)

const votesFile = `${idDetails.fileId}.v.json`
const outVotesPath = path.join(metaDir2, votesFile)
const votesRelativePath = path.join('meta', idDetails.dir1, idDetails.dir2, votesFile)
// const outReasonsPath = path.join(metaDir2, `${idDetails.fileId}.reasons.${model}.json`)
// const outValidationPath = path.join(metaDir2, `${idDetails.fileId}.validation.${answerModel}.${model}.json`)

const { openAi } = useClient()
const maxTokens = 1024
const temperature = 0.1
const expectedReasonsSchema = {
    "reason": "Your reason goes here. Below score is only an example. Score should reflect the review of the answer.",
    "score": 1
}

// Read v.json in meta dir
// Find answers that haven't been ranked in v.json
// Include their question and answer in the request
// Write the updated v.json to include `modelVotes` key val pair, `modelReasons` key val pair, and `gradedBy` string array <questionId>-<modelusername>

let currentVotes = null
if (fs.existsSync(outVotesPath)) {
    currentVotes = fs.readFileSync(outVotesPath, 'utf-8')
}
let currentVotesJson = JSON.parse(currentVotes) ?? {}

// Check if the answer has already been ranked
let alreadyVoted = currentVotesJson.gradedBy != null &&
    currentVotesJson.gradedBy.length > 0 &&
    currentVotesJson.gradedBy.includes(answerId)

if (alreadyVoted) {
    console.log(`Already graded ${answerId} in ${votesRelativePath}`)
    process.exit()
}

alreadyVoted = currentVotesJson.modelVotes != null && currentVotesJson.modelVotes[answerModel] != null &&
    currentVotesJson.modelReasons != null && currentVotesJson.modelReasons[answerModel] != null;

if (alreadyVoted) {
    console.log(`Skipping existing answer ${answerId} in ${votesRelativePath}`)
    process.exit()
}

let systemPrompt = { "role": "system", "content": "You are an AI assistant that votes on the quality and relevance of answers to a given question. Before giving votes, give an critique of each answer based on quality and relevance." }

let r = null
let startTime = performance.now()

let content = `Below I have a user question and an answer to the user question. I want you to give a score out of 10 based on the quality in relation to the original user question. 
    
## Original User Question

Title: ${question.title}
Body:
${question.body}
Tags: ${question.tags.join(', ')}
---

Critique the below answer to justify your score, providing a brief explanation before returning the simple JSON object showing your reasoning and score.

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

Because these are coding questions, mistakes in the code are critical and should be scored lower. Look closely at the syntax and logic of the code for any mistakes. Missing mistakes in reviews leads to a failed review, and many answers are not correct.

You MUST provide a JSON object with the following schema:

## Example JSON Response

\`\`\`json
${JSON.stringify(expectedReasonsSchema, null, 4)}
\`\`\`

Use code fences, aka triple backticks, to encapsulate your JSON object.
`

logDebug(`=== REQUEST ${id} ===`)
logDebug(`${id}, ${answerPath}`)
logDebug(`=== END REQUEST ${id} ===\n\n`)

const sleep = ms => new Promise(r => setTimeout(r, ms));

let retry = 0
let elapsed_ms = 0
let txt = null
let res = null
const created = new Date().toISOString()
const errorPath = path.join(metaDir2, `${idDetails.fileId}.e.${model}.json`)

while (retry++ <= 10) {
    let startTime = performance.now()
    let sleepMs = 1000 * retry
    try {
        let reqOptions = { content, model, port, systemPrompt, temperature, maxTokens }
        r = await openAi(reqOptions)
        let endTime = performance.now()
        elapsed_ms = parseInt(endTime - startTime)

        logDebug(`=== RESPONSE ${id} in ${elapsed_ms}ms ===\n`)
        txt = await r.text()
        
        if (!r.ok) {
            console.log(`${r.status} openAi request ${retry + 1} failed: ${txt}`)
            if (r.status === 429) {
                // Try handle GROQ rate limiting, if not found, defaults to 1000ms
                console.log(`Rate limited, retry-after ${r.headers.get('retry-after')} seconds...`)

                const retryAfter = parseInt(r.headers.get('retry-after'))
                if (!isNaN(retryAfter)) {
                    sleepMs = retryAfter * 1000
                }
            }
        } else {
            res = openAiResponse(txt, model)
        }
        if (res) break        
    } catch (e) {
        logError(`Failed:`, e.message)
        fs.writeFileSync(errorPath, JSON.stringify({ id, error: e.message, stacktrace: e.stacktrace }, null, 4))
        process.exit()
    }
    console.log(`retrying in ${sleepMs}ms...`)
    await sleep(sleepMs)
}

let responseContent = txt.length > 0 && res?.choices?.length > 0 && res.choices[0].message?.content
if (!responseContent) {
    logError(`Empty response from ${answerId}`)
    process.exit()
}

let structuredReasons = null;

if(responseContent.trim().startsWith('{')) {
    // Try to extract the JSON from the response, if it's already JSON
    responseContent = `\n\`\`\`json\n${responseContent}\n\`\`\``
}

structuredReasons = responseContent.match(/(?<=```json\n)\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);

if (structuredReasons == null || structuredReasons.length === 0) {
    logError(`No structured reasons found in response: ${responseContent}`);
    process.exit()
}

// Take first structured reason that contains the string 'score' and 'reason'
structuredReasons = structuredReasons.filter(x => x.includes('score') && x.includes('reason'))

if (structuredReasons.length === 0) {
    logError(`No valid structured reasons found in response: ${responseContent}`);
    process.exit()
}

const isValid = structuredReasons[0].includes('score') && structuredReasons[0].includes('reason')
if (!isValid) {
    logError(`Invalid structured reasons found in response: ${responseContent}`);
    process.exit()
}

// Read current v.json
let votes = { modelVotes: {} }
try {
    if (fs.existsSync(outVotesPath)) {
        votes = JSON.parse(fs.readFileSync(outVotesPath, 'utf-8'))
    }
} catch (e) {
    logError(`Failed to read votes file: ${outVotesPath}`, e)
    fs.writeFileSync(outVotesPath, JSON.stringify(emptyVFile(), null, 4))
}

logDebug(`JSON found ${structuredReasons.length}`)
logDebug(`=== STRUCTURED REASONS for ${answerId} ===`)
logDebug(structuredReasons[0])
logDebug(`=== END STRUCTURED REASONS for ${answerPath} in ${parseInt(performance.now() - startTime)}ms ===\n\n`)

let voteResult = JSON.parse(structuredReasons[0])
if (voteResult.score == null || voteResult.reason == null) {
    logError(`Invalid vote result for ${answerPath}: ${structuredReasons[0]}`)
    process.exit()
}

// Update votes.modelVotes
votes.modelVotes = votes.modelVotes ?? {}
votes.modelVotes[answerModel] = voteResult.score
votes.modelReasons = votes.modelReasons ?? {}
votes.modelReasons[answerModel] = voteResult.reason

let safeModel = openAiFromModel(model)
// Update votes.gradedBy
let initGradedBy = {}
initGradedBy[safeModel] = []
votes.gradedBy = votes.gradedBy ?? {}
votes.gradedBy[safeModel] = votes.gradedBy[safeModel] ?? initGradedBy[safeModel]
votes.gradedBy[safeModel].push(`${id}-${answerModel}`)

// Write updated votes to v.json
fs.writeFileSync(outVotesPath, JSON.stringify(votes, null, 4))
// Done
logDebug(`Wrote ${outVotesPath}`)
process.exit(0)