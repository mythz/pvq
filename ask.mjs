#!/usr/bin/env node

import fs from "fs"

let path = process.argv[2]
let model = process.argv[3]
let port = process.argv[4] ?? '11434'
if (!model) throw "model required"

if (!fs.existsSync(path)) {
    let id = parseInt(process.argv[2])
    if (isNaN(id)) {
        console.log('not valid number:', process.argv[2])
        process.exit()
    }
    
    const idStr = `${id}`.padStart(9, '0')
    
    const dir1 = idStr.substring(0,3)
    const dir2 = idStr.substring(3,6)
    const file = idStr.substring(6) + '.json'
    path = `questions/${dir1}/${dir2}/${file}`

    if (!fs.existsSync(path)) {
        console.log(`file does not exist: ${path}`)
        process.exit()
    }
}

const json = fs.readFileSync(path, 'utf-8')
const obj = JSON.parse(json)
const id = obj.Id


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

logDebug(`=== REQUEST ${id} ===`)
logDebug(`${id}, ${path}, ${obj.Body}`)
logDebug(`=== END REQUEST ${id} ===\n\n`)

const system = { "role":"system", "content":"You are a friendly AI Assistant that helps answer developer questions. Think step by step and assist the user with their question, ensuring that your answer is relevant, on topic and provides actionable advice with code examples as appropriate." }
const temperature = 0.7
const max_tokens = 2048

let r = null
let startTime = performance.now()
try {
    const content = "Title: " + obj.Title + "\nTags:" + obj.Tags.join(',') + "\n\n" + obj.Body
    r = await fetch(`http://localhost:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                system,
                { role:"user", content },
            ],
            temperature,
            model,
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
const created = new Date(1710078197*1000).toISOString()
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
    fs.writeFileSync(lastLeftPart(path,'.') + `.a.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
} else {
    logError(`ERROR ${id}: missing response`)
    fs.writeFileSync(lastLeftPart(path,'.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
}
logDebug(`\n=== END RESPONSE ${id} in ${elapsed_ms}ms ===\n\n`)

function lastLeftPart(s, needle) {
    if (s == null) return null
    let pos = s.lastIndexOf(needle)
    return pos == -1
        ? s
        : s.substring(0, pos)
}
