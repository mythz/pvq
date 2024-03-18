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

const questionJson = fs.readFileSync(questionPath, 'utf-8')
const question = JSON.parse(questionJson)
const id = question.Id

const answerFiles = fs.readdirSync(path.dirname(questionPath)).filter(file => file.startsWith(id) && file.endsWith(`.a.json`))

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

const system = { "role":"system", "content":"You are an AI assistant that ranks answers to a given question. Provide a brief explanation for each ranking." }
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

    let content = `Question: ${question.Title}\n\n${question.Body}\n\nAnswers:\n${answers.map((answer, index) => `Answer ${answerMap[index]}:\n${answer.content}`).join('\n\n')}\n\nRank the above answers from best to worst, providing a brief explanation for each ranking.`
    content += `\n\n Return the rankings in the following format: "A: 3, B: 1, C: 2, D: 5, E: 4" etc. , but in a single JSON object.`

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