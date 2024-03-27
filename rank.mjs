#!/usr/bin/env node

import fs from "fs"
import path from "path"

console.log("Starting...")

let questionPath = process.argv[2] ?? './questions/000/105/372.json'
let model = process.argv[3] ?? 'open-mixtral-8x7b'
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

console.log("Starting...")

const questionJson = fs.readFileSync(questionPath, 'utf-8')
const question = JSON.parse(questionJson)
console.log(question)
// Extract ID and pad to 3 digits with zeros
const id = `${lastRightPart(lastLeftPart(questionPath,'.'),'/')}`.padStart(3, '0')

const answerFiles = fs.readdirSync(path.dirname(questionPath)).filter(file => file.startsWith(id) && file.indexOf(`.a.`) > -1)
let humanAnswerFiles = fs.readdirSync(path.dirname(questionPath)).filter(file => file.startsWith(id) && file.indexOf(`.h.`) > -1)
// if there is a duplicate answer in humanAnswerFiles, eg have the same Id result from readHumanAnswerFile, remove it
if(humanAnswerFiles.length > 1 &&  readHumanAnswerFile(humanAnswerFiles[0]) === readHumanAnswerFile(humanAnswerFiles[1])) {
    humanAnswerFiles = humanAnswerFiles.slice(1)
}

const allAnswerFiles = answerFiles.concat(humanAnswerFiles)

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

// Function to read a human answer file, and return the Id
function readHumanAnswerFile(file) {
    const answerJson = fs.readFileSync(path.join(path.dirname(questionPath), file), 'utf-8')
    const answer = JSON.parse(answerJson)
    return answer.Id
}

const system = { "role":"system", "content":"You are an AI assistant that votes on the quality and relevance of answers to a given question. Before giving votes, give an critique of each answer based on quality and relevance." }
const temperature = 0.2
const max_tokens = 1024

let modelMap = {};

logDebug('=== ANSWER FILES ===')
logDebug(allAnswerFiles)
logDebug('=== END ANSWER FILES ===\n\n')

let r = null
let startTime = performance.now()
let content = null;
try {
    let answers = allAnswerFiles.sort(() => Math.random() - 0.5).map(file => {
        // Check if `.h.` is in the file name, if so, it's a human answer
        if (file.indexOf(`.h.`) > -1) {
            const answerJson = fs.readFileSync(path.join(path.dirname(questionPath), file), 'utf-8')
            const answer = JSON.parse(answerJson)
            // model is human-accepted and human-most-voted
            let humanModel = lastRightPart(file, '.h.')
            humanModel = lastLeftPart(humanModel, '.')
            return {model: humanModel, content: answer.body};
        }
        // file name has model name between .a. and .json
        let model = lastRightPart(file, '.a.')
        model = lastLeftPart(model, '.')
        const answerJson = fs.readFileSync(path.join(path.dirname(questionPath), file), 'utf-8')
        const answer = JSON.parse(answerJson)
        return {model: model, content: answer.choices[0].message.content}
    })

    // Map answer `model` from answers to letter, eg A, B, C, D, E
    const answerMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, answers.length)

    content = `Below I have a user question and a set of different answers. I want you to give a score out of 10 to each of the answers based on the quality in relation to the original user question. Original User Question: ${question.title}\n\n${question.body}\n\nCritique the below answers to justify your scores, providing a brief explanation for each before returning the simple JSON object showing your score results for each answer. Make sure you write out your explanation for your vote distribution first.\n\nAnswers:\n${answers.map((answer, index) => `Answer ${answerMap[index]}:\n${answers[index].content}`).join('\n\n')}\n\nEnd of Answers\n\nNow review and score the answers above out of 10, where 10 is a high quality, correct answer with good explanations, examples etc, without being too verbose. Think step by step as to why each answer is good or bad. Vote 0 if the answer is not relevant or of low quality, and vote 1-10 if the answer is relevant, based on quality.`
    content += `\n\n Lastly, return the votes in the following format: \`{"A": 3, "B": 0 "C": 2, "D": 5, "E": 0}\` etc. , eg in a single JSON object. Do not distribute more than 10 votes.
    
    Note: This question has been tagged with the following tags: ${question.tags.join(', ')}. This information is important to consider when voting since it will likely include the specific language or framework being used and/or requested.
    Note: Answers in different languages than requested should be penalized by giving a -1 vote.
    Note: You must include the JSON representation of your votes in your response at the end. Do not forget this.
    Note: To ensure the best quality of votes, please ensure that you have read the question and all the answers carefully.
    Note: Irrelevant answers should be penalized by giving a -1 vote.
    `
    // Create a mapping between the model and the letter used, since our answers are shuffled
    answers.forEach((answer, index) => {
        modelMap[answerMap[index]] = answer.model
    })

    logDebug(`=== REQUEST ${id} ===`)
    logDebug(`${id}, ${questionPath}`)
    logDebug(`=== END REQUEST ${id} ===\n\n`)

    r = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            messages: [
                system,
                { role:"user", "content": content },
            ],
            temperature,
            'model': model,
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
    messages: [system,{ role:"user", "content": content }],
    temperature,
    max_tokens,
    elapsed_ms,
}

const responseContent = res?.choices?.length > 0 && res.choices[0].message?.content
const safeModel = model.replace(/:/g,'-')
if (responseContent) {
    logInfo(`id:${id}, created:${created}, model:${model}, temperature:${temperature}, elapsed_ms:${elapsed_ms}, choices:${res.choices.length}, size:${responseContent.length}`)
    // Extract the JSON object from the response, it will be among the response as a whole, but towards the end
    const voteString = responseContent.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/)
    // Ensure that voteString has a match, and is valid JSON
    if (voteString == null || voteString.length === 0) {
        logError(`ERROR ${id}: missing response`)
        fs.writeFileSync(lastLeftPart(questionPath,'.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
        process.exit()
    }
    // Test if JSON
    let voteJson = null
    try {
        voteJson = JSON.parse(voteString[0])
    } catch (e) {
        logError(`ERROR ${id}: invalid response`)
        fs.writeFileSync(lastLeftPart(questionPath,'.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
        process.exit()
    }
    // Resolve model name to vote mapping before writing to file
    let voteMap = {}
    for (let key in voteJson) {
        voteMap[modelMap[key]] = voteJson[key]
    }
    let result = {
        modelVotes: voteMap
    }
    fs.writeFileSync(lastLeftPart(questionPath,'.') + `.v.${safeModel}.json`, JSON.stringify(result, undefined, 2), 'UTF-8')
    let validation = {
        content: content,
        response: res,
        modelVotes: voteJson,
        modelMap: modelMap
    }
    fs.writeFileSync(lastLeftPart(questionPath,'.') + `.validation.${safeModel}.json`, JSON.stringify(validation, undefined,2), 'UTF-8')
} else {
    logError(`ERROR ${id}: missing response`)
    fs.writeFileSync(lastLeftPart(questionPath,'.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
}
logDebug(`\n=== END RESPONSE ${id} ===\n\n`)

// Sleep for 2 seconds to avoid rate limiting
await new Promise(resolve => setTimeout(resolve, 5000))

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