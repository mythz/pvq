#!/usr/bin/env node

import fs from "fs"
import path from "path"
import {useClient, useLogging, idParts, lastLeftPart, lastRightPart, openAiResponse} from "./lib.mjs"

let questionPath = process.argv[2]
let model = process.argv[3]
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

const { openAi } = useClient()
const maxTokens = 4096
const temperature = 0.1

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
        if(answerJson == null || answerJson.length === 0) {
            logError(`Empty answer file: ${file}`)
            return { model: model, content: '' }
        }
        const answer = openAiResponse(answerJson)
        return { model: model, content: answer.choices[0].message.content }
    })

    const answerMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, answers.length)
    answers.forEach((answer, index) => {
        modelMap[answerMap[index]] = answer.model
    })

    logDebug('=== ANSWERS ===')
    logDebug()

    content = `Below I have a user question and a set of different answers. I want you to give a score out of 10 to each of the answers based on the quality in relation to the original user question. 
    
    ## Example Response
    
    Here is my review of the answers, I will hold off on providing the scores until the end:
    
    - Answer A: This answer provides a clear and concise explanation of the problem and provides a good example. However, it does not address the question directly.
    - Answer B: This answer is very accurate and provides a clear and concise explanation. It also addresses the question directly.
    - Answer C: This answer is not very accurate and does not provide a clear explanation. It also does not address the question directly.
    
    Given my review, I would score Answer A: 6, Answer B: 9, and Answer C: 3.
    
    Here is the JSON object of my scores:
    { "A": 6, "B": 9, "C": 3 }
    
    END OF EXAMPLE
    
    ## Original User Question
    
    Title: ${question.title}
    Body:
    ${question.body}
    Tags: ${question.tags.join(', ')}
    
    Critique the below answers to justify your scores, providing a brief explanation for each before returning the simple JSON object showing your score results for each answer. Make sure you write out your explanation for your vote distribution first.
    
    Answers:\n${answers.map((answer, index) => `Answer ${answerMap[index]}:\n${answers[index].content}`).join('\n\n')}
    
    End of Answers
    ---
    
    Now review and score the answers above out of 10. Here is your criteria, be harsh but fair in your review, consider the following when scoring the answers:
    
    - Accurate information (this is the most important), ensure you think about the correctness of the information provided
    - Clear and concise explanation
    - Good examples
    - Addresses the question
    - Examples of code or pseudocode in the same language as the question`
    content += `
    
    At the end of your response, return all your votes in a single JSON object in the following format: \`{"A": 3, "B": 0 "C": 2, "D": 5, "E": 0}\` etc. , eg in a single JSON object.
    You must include a critique and vote for every answer provided, missing votes will result in a failed review.
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

const resJson = await r.text()
const created = new Date().toISOString()

// Check if resJson is empty
logDebug('RESPONSE JSON LENGTH: ' + resJson.length)

logDebug('=== PARSING RESPONSE ===')
const res = openAiResponse(resJson, model)
logDebug('=== END PARSING RESPONSE ===\n\n')
res.request = {
    id,
    created,
    messages: [systemPrompt, { role: "user", "content": content }],
    temperature,
    max_tokens: maxTokens,
    elapsed_ms,
    modelMap: modelMap
}

logDebug('=== RESPONSE CONTENT ===')
logDebug(res.choices[0].message.content)
logDebug('=== END RESPONSE CONTENT ===\n\n')

const responseContent = res?.choices?.length > 0 && res.choices[0].message?.content
if (res.error != null) {
    logError(`ERROR ${id}: ${JSON.stringify(res.error)}`)
    if (res.error.code === 'rate_limit_exceeded') {
        await new Promise(resolve => setTimeout(resolve, 30000))
    }
}
logDebug('=== SAFE MODEL ===')
const safeModel = model.replace(/:/g, '-')
logDebug(safeModel)
logDebug('=== END SAFE MODEL ===\n\n')
if (responseContent) {
    logInfo(`id:${id}, created:${created}, model:${model}, temperature:${temperature}, elapsed_ms:${elapsed_ms}, choices:${res.choices.length}, size:${responseContent.length}`)
    let voteString = responseContent.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/)
    if (voteString == null || voteString.length === 0) {
        logError(`ERROR ${id}: missing response`)
        fs.writeFileSync(lastLeftPart(questionPath, '.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
        process.exit()
    }
    let voteJson = null
    // Sort matches by length and filter out entries that are less than 10 characters
    voteString = voteString.sort((a, b) => b.length - a.length).filter(x => x.length > 10)
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

    const modelVotes = {}
    const sortedKeys = Object.keys(voteMap).sort()
    sortedKeys.forEach(key => modelVotes[key] = voteMap[key])  

    let result = {
        modelVotes
    }

    logDebug('\n=== VOTES ===')
    const votesJson = JSON.stringify(result, undefined, 2)
    logDebug(votesJson)
    fs.writeFileSync(lastLeftPart(questionPath, '.') + `.v.json`, votesJson, 'UTF-8')
    logDebug('=== END VOTES ===\n')

    let validation = {
        content: content,
        response: res,
        modelVotes,
        modelMap: modelMap
    }
    fs.writeFileSync(lastLeftPart(questionPath, '.') + `.validation.${safeModel}.json`, JSON.stringify(validation, undefined, 2), 'UTF-8')
} else {
    logError(`ERROR ${id}: missing response`)
    fs.writeFileSync(lastLeftPart(questionPath, '.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
}

logDebug(`\n=== END RESPONSE ${id} in ${parseInt(performance.now() - startTime)}ms ===\n\n`)
process.exit()
//await new Promise(resolve => setTimeout(resolve, 5000))