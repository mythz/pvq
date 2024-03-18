#!/usr/bin/env node

import fs from "fs"
import path from "path"

let questionPath = process.argv[2]
let model = process.argv[3]
let port = process.argv[4] ?? '11434'
if (!model) throw "model required"

if (!fs.existsSync(questionPath)) {
    console.log(`file does not exist: ${questionPath}`)
    process.exit()
}

// Read the .env file
const envFile = path.join('./', '.env');
const envData = fs.readFileSync(envFile, { encoding: 'utf-8' });

// Parse the environment variables
const envLines = envData.split('\n');
for (const line of envLines) {
    const [key, value] = line.trim().split('=');
    if (key && value) {
        process.env[key] = value;
    }
}

const questionJson = fs.readFileSync(questionPath, 'utf-8')
const question = JSON.parse(questionJson)
// Extract ID and pad to 3 digits with zeros
const id = `${question.Id}`.padStart(3, '0')
const answerFiles = fs.readdirSync(path.dirname(questionPath)).filter(file => file.startsWith(id) && file.indexOf(`.a.`) > -1)

let infoStream = null
function logInfo(message) {
    infoStream ??= fs.createWriteStream("info.log", {flags:'a'})
    console.info(message)
    infoStream.write(message + "\n")
}

let debugStream = null
function logDebug(message) {
    debugStream ??= fs.createWriteStream("debug.log", {flags:'a'})
    console.log(message)
    debugStream.write(message + "\n")
}

let errorStream = null
function logError(message) {
    errorStream ??= fs.createWriteStream("error.log", {flags:'a'})
    console.error(message)
    errorStream.write(message + "\n")
}

const system = { "role":"system", "content":"You are an AI assistant that votes on the quality and relevance of answers to a given question. Before giving votes, give an critique of each answer based on quality and relevance." }
const temperature = 0.7
const max_tokens = 1024

let r = null
let startTime = performance.now()
try {
    const answers = answerFiles.sort(() => Math.random() - 0.5).map(file => {
        // file name has model name between .a. and .json
        let model = lastRightPart(file, '.a.')
        const answerJson = fs.readFileSync(path.join(path.dirname(questionPath), file), 'utf-8')
        const answer = JSON.parse(answerJson)
        return {model: model, content: answer.choices[0].message.content}
    })

    // Map answer `model` from answers to letter, eg A, B, C, D, E
    const answerMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, answers.length)

    let content = `Below I have a user question and a set of different answers. I want you to distribute up to 10 votes between the answers based on the quality in relation to the original user question. Original User Question: ${question.Title}\n\n${question.Body}\n\nCritique the below answers to justify your distribution of votes, providing a brief explanation for each before returning the simple JSON object showing your voting results. Make sure you write out your explanation for your vote distribution first.\n\nAnswers:\n${answers.map((answer, index) => `Answer ${answerMap[index]}:\n${answer.content}`).join('\n\n')}\n\nEnd of Answers, now review and distribute your votes between the answers above. Think step by step as to why each answer is good or bad, you don't have to use all 10 votes if the answer quality or relevance is not of a decent quality.`
    content += `\n\n Lastly, return the votes in the following format: \`{"A": 3, "B": 0 "C": 2, "D": 5, "E": 0}\` etc. , eg in a single JSON object. Do not distribute more than 10 votes.`

    logDebug(`=== REQUEST ${id} ===`)
    logDebug(`${id}, ${questionPath}, ${content}`)
    logDebug(`=== END REQUEST ${id} ===\n\n`)

    r = await fetch(`https://api.mistral.ai/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            messages: [
                system,
                { role:"user", "content": content },
            ],
            temperature,
            'model': 'open-mixtral-8x7b',
            max_tokens,
            stream: false,
        })
    })
} catch (e) {
    logError(`Failed`)
}
let endTime = performance.now()
let elapsed_ms = parseInt(endTime - startTime)

logDebug(`=== RESPONSE ${id} in ${elapsed_ms}ms ===\n`)
const res = await r.json()
const created = new Date().toISOString()
res.request = {
    id,
    created,
    messages: { system },
    temperature,
    max_tokens,
    elapsed_ms,
}

const content = res?.choices?.length > 0 && res.choices[0].message?.content
const safeModel = model.replace(/:/g,'-')
if (content) {
    logInfo(`id:${id}, created:${created}, model:${model}, temperature:${temperature}, elapsed_ms:${elapsed_ms}, choices:${res.choices.length}, size:${content.length}`)
    logDebug(content)
    fs.writeFileSync(lastLeftPart(questionPath,'.') + `.r.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
} else {
    logError(`ERROR ${id}: missing response`)
    fs.writeFileSync(lastLeftPart(questionPath,'.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
}
logDebug(`\n=== END RESPONSE ${id} ===\n\n`)

function lastLeftPart(s, needle) {
    if (s == null) return null
    let pos = s.lastIndexOf(needle)
    return pos == -1
        ? s
        : s.substring(0, pos)
}
function lastRightPart(s, needle) {
    if (s == null) return null
    let pos = s.lastIndexOf(needle)
    return pos == -1
        ? s
        : s.substring(pos + needle.length)
}