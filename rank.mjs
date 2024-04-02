#!/usr/bin/env node

import fs from "fs"
import path from "path"
import {useClient, useLogging, idParts, lastLeftPart, lastRightPart, openAiResponse} from "./lib.mjs"

let questionPath = process.argv[2] ?? './questions/000/105/372.json'
let model = process.argv[3] ?? 'mixtral'
let port = process.argv[4] ?? '11434'
if (!model) throw "model required"

if (!fs.existsSync(questionPath)) {
    console.log(`file does not exist: ${questionPath}`)
    process.exit()
}

const { logInfo, logDebug, logError } = useLogging()

console.log("Starting...")

const questionJson = fs.readFileSync(questionPath, 'utf-8')
const question = JSON.parse(questionJson)

const id = `${lastRightPart(lastLeftPart(questionPath, '.'), '/')}`.padStart(3, '0')

const answerFiles = fs.readdirSync(path.dirname(questionPath)).filter(file => file.startsWith(id) && file.indexOf(`.a.`) > -1)
let humanAnswerFiles = fs.readdirSync(path.dirname(questionPath)).filter(file => file.startsWith(id) && file.indexOf(`.h.`) > -1)

if (humanAnswerFiles.length > 1 && readHumanAnswerFile(humanAnswerFiles[0]) === readHumanAnswerFile(humanAnswerFiles[1])) {
    humanAnswerFiles = humanAnswerFiles.slice(1)
}

const allAnswerFiles = answerFiles.concat(humanAnswerFiles)

function readHumanAnswerFile(file) {
    const answerJson = fs.readFileSync(path.join(path.dirname(questionPath), file), 'utf-8')
    const answer = JSON.parse(answerJson)
    return answer.Id
}

const { openAi, openAiDefaults } = useClient()
const { temperature, maxTokens } = openAiDefaults()

let systemPrompt = { "role":"system", "content":"You are an AI assistant that votes on the quality and relevance of answers to a given question. Before giving votes, give an critique of each answer based on quality and relevance." }

let modelMap = {};

logDebug('=== ANSWER FILES ===')
logDebug(allAnswerFiles)
logDebug('=== END ANSWER FILES ===\n\n')

let r = null
let startTime = performance.now()
let content = null;
try {
    let answers = allAnswerFiles.sort(() => Math.random() - 0.5).map(file => {
        if (file.indexOf(`.h.`) > -1) {
            const answerJson = fs.readFileSync(path.join(path.dirname(questionPath), file), 'utf-8')
            const answer = JSON.parse(answerJson)
            let humanModel = lastRightPart(file, '.h.')
            humanModel = lastLeftPart(humanModel, '.')
            return { model: humanModel, content: answer.body };
        }
        let model = lastRightPart(file, '.a.')
        model = lastLeftPart(model, '.')
        const answerJson = fs.readFileSync(path.join(path.dirname(questionPath), file), 'utf-8')
        const answer = openAiResponse(answerJson)
        console.log(file)
        console.log(answer)
        return { model: model, content: answer.choices[0].message.content }
    })

    const answerMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, answers.length)

    content = `Below I have a user question and a set of different answers. I want you to give a score out of 10 to each of the answers based on the quality in relation to the original user question. Original User Question: ${question.title}\n\n${question.body}\n\nCritique the below answers to justify your scores, providing a brief explanation for each before returning the simple JSON object showing your score results for each answer. Make sure you write out your explanation for your vote distribution first.\n\nAnswers:\n${answers.map((answer, index) => `Answer ${answerMap[index]}:\n${answers[index].content}`).join('\n\n')}\n\nEnd of Answers\n\nNow review and score the answers above out of 10, where 10 is a high quality, correct answer with good explanations, examples etc, without being too verbose. Think step by step as to why each answer is good or bad. Vote 0 if the answer is not relevant or of low quality, and vote 1-10 if the answer is relevant, based on quality.`
    content += `\n\n Lastly, return the votes in the following format: \`{"A": 3, "B": 0 "C": 2, "D": 5, "E": 0}\` etc. , eg in a single JSON object. Do not distribute more than 10 votes.

    Note: This question has been tagged with the following tags: ${question.tags.join(', ')}. This information is important to consider when voting since it will likely include the specific language or framework being used and/or requested.
    Note: Answers in different languages than requested should be penalized by giving a -1 vote.
    Note: You must include the JSON representation of your votes in your response at the end. Do not forget this.
    Note: To ensure the best quality of votes, please ensure that you have read the question and all the answers carefully.
    Note: Irrelevant answers should be penalized by giving a -1 vote.
    `

    answers.forEach((answer, index) => {
        modelMap[answerMap[index]] = answer.model
    })

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

const res = await r.json()
const created = new Date().toISOString()
res.request = {
    id,
    created,
    messages: [systemPrompt, { role: "user", "content": content }],
    temperature,
    max_tokens: maxTokens,
    elapsed_ms,
}

const responseContent = res?.choices?.length > 0 && res.choices[0].message?.content
if (res.error != null) {
    logError(`ERROR ${id}: ${JSON.stringify(res.error)}`)
    if (res.error.code === 'rate_limit_exceeded') {
        await new Promise(resolve => setTimeout(resolve, 30000))
    }
}
const safeModel = model.replace(/:/g, '-')
if (responseContent) {
    logInfo(`id:${id}, created:${created}, model:${model}, temperature:${temperature}, elapsed_ms:${elapsed_ms}, choices:${res.choices.length}, size:${responseContent.length}`)
    const voteString = responseContent.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/)
    if (voteString == null || voteString.length === 0) {
        logError(`ERROR ${id}: missing response`)
        fs.writeFileSync(lastLeftPart(questionPath, '.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
        process.exit()
    }
    let voteJson = null
    try {
        voteJson = JSON.parse(voteString[0])
    } catch (e) {
        logError(`ERROR ${id}: invalid response`)
        fs.writeFileSync(lastLeftPart(questionPath, '.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
        process.exit()
    }
    let voteMap = {}
    for (let key in voteJson) {
        voteMap[modelMap[key]] = voteJson[key]
    }
    let result = {
        modelVotes: voteMap
    }
    fs.writeFileSync(lastLeftPart(questionPath, '.') + `.v.json`, JSON.stringify(result, undefined, 2), 'UTF-8')
    let validation = {
        content: content,
        response: res,
        modelVotes: voteJson,
        modelMap: modelMap
    }
    fs.writeFileSync(lastLeftPart(questionPath, '.') + `.validation.${safeModel}.json`, JSON.stringify(validation, undefined, 2), 'UTF-8')
} else {
    logError(`ERROR ${id}: missing response`)
    fs.writeFileSync(lastLeftPart(questionPath, '.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
}
logDebug(`\n=== END RESPONSE ${id} ===\n\n`)

await new Promise(resolve => setTimeout(resolve, 5000))