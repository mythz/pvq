#!/usr/bin/env node

import fs from "fs"
import path from "path"
import {
    useClient,
    useLogging,
    idParts,
    lastLeftPart,
    lastRightPart,
    openAiResponse
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
const questionPath = lastRightPart(lastLeftPart(answerPath, '.'), '/') + '.json'
const questionJson = fs.readFileSync(questionPath, 'utf-8')
const question = JSON.parse(questionJson)
const id = idParts(question.Id)

// Ensure meta dir1 exists
const metaDir1 = path.join(metaDir, id.dir1)
const metaDir2 = path.join(metaDir1, id.dir2)
if (!fs.existsSync(metaDir1)) {
    fs.mkdirSync(metaDir1)
    fs.mkdirSync(metaDir2)
}

if (!fs.existsSync(metaDir2)) {
    fs.mkdirSync(metaDir2)
}

const outVotesPath = path.join(metaDir2, `${id.fileId}.v.${model}.json`)
const outReasonsPath = path.join(metaDir2, `${id.fileId}.reasons.${model}.json`)
const outValidationPath = path.join(metaDir2, `${id.fileId}.validation.${model}.json`)

const { openAi } = useClient()
const maxTokens = 1024
const temperature = 0.1
const expectedReasonsSchema = {
    "score": {
        "type": "integer"
    },
    "reason": {
        "type": "string"
    }
}

let systemPrompt = { "role":"system", "content":"You are an AI assistant that votes on the quality and relevance of answers to a given question. Before giving votes, give an critique of each answer based on quality and relevance." }

let r = null
let startTime = performance.now()
let content = null;
try {

    content = `Below I have a user question and an answer to the user question. I want you to give a score out of 10 based on the quality in relation to the original user question. 
    
    ## Example Response 1
    
    Here is my review of the answer, I will hold off on providing the scores until the end:

    Review: The answer is well written and provides a clear and concise explanation. The examples given are relevant and help to illustrate the points made. The answer addresses the question and provides examples of code in the same language as the question.    
    My score for this answer is 9.
    
    Here is the JSON object of my score:
    { 
      "score": 9,
      "reason": "The answer is well written and provides a clear and concise explanation. The examples given are relevant and help to illustrate the points made. The answer addresses the question and provides examples of code in the same language as the question."
    }
    END OF EXAMPLE 1
    
    ## Example Response 2
    
    Here is my review of the answer, I will hold off on providing the scores until the end:
    
    Review: The answer addresses the question but lacks clarity and conciseness. The information provided is accurate but the explanation is not clear. The examples given are relevant but could be improved. The answer does not provide examples of code in the same language as the question.
    My score for this answer is 4.
    
    Here is the JSON object of my score:
    { 
      "score": 4,
      "reason": "The answer addresses the question but lacks clarity and conciseness. The information provided is accurate but the explanation is not clear. The examples given are relevant but could be improved. The answer does not provide examples of code in the same language as the question."
    }
    END OF EXAMPLE 2
    
    ---
    
    ## Original User Question
    
    Title: ${question.title}
    Body:
    ${question.body}
    Tags: ${question.tags.join(', ')}
    
    Critique the below answer to justify your score, providing a brief explanation before returning the simple JSON object showing your score with your reasoning. Make sure you write out your explanation before voting.
    
    Answer:
    ${answer.content}
    ---
    
    Now review and score the answer above out of 10. Here is your criteria, be harsh but fair in your review, consider the following when scoring the answers:
    
    - Accurate information (this is the most important), ensure you think about the correctness of the information provided
    - Clear and concise explanation
    - Good examples
    - Addresses the question
    - Examples of code or pseudocode in the same language as the question`
    content += `
    
    At the end of your response, return all your votes in a single JSON object in the following format:
    
    ${JSON.stringify(expectedReasonsSchema,null,4)}
    
    You must include a reason and vote for the answer provided, missing either will result in a failed review.
    `

    logDebug(`=== REQUEST ${id} ===`)
    logDebug(`${id}, ${questionPath}`)
    logDebug(`=== END REQUEST ${id} ===\n\n`)

    r = await openAi({ content, model, port, systemPrompt, temperature, maxTokens })
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

fs.writeFileSync(outValidationPath, JSON.stringify({response: res, created, model, rawScores: structuredReasons[0]}))
let votes = JSON.parse(structuredReasons[0])
fs.writeFileSync(outReasonsPath, JSON.stringify(votes, null, 4))

// Convert to votes structure
const vote = { [model]: votes.score }
fs.writeFileSync(outVotesPath, JSON.stringify(vote, null, 4))

// Done
logDebug(`Wrote ${outVotesPath}`)
logDebug(`Wrote ${outReasonsPath}`)
logDebug(`Wrote ${outValidationPath}`)
process.exit(0)