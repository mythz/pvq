#!/usr/bin/env node

import fs from "fs"

let path = process.argv[2]

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

const system = { "role":"system", "content":"You are a friendly AI Assistant that helps answer developer questions" }
const temperature = 0.7
const max_tokens = -1

let r = null
let startTime = performance.now()
try {
    const content = obj.Title + "\n\n" + obj.Body //from 81991+
    r = await fetch('http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                system,
                { role:"user", content },
            ],
            temperature,
            model: "codellama",
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
const model = lastLeftPart(lastRightPart(res.model,'/'),'.')
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
if (content) {
    logInfo(`id:${id}, created:${created}, model:${model}, temperature:${temperature}, elapsed_ms:${elapsed_ms}, choices:${res.choices.length}, size:${content.length}`)
    logDebug(content)
    fs.writeFileSync(lastLeftPart(path,'.') + `.a.${model}.json`, JSON.stringify(res, undefined, 4), 'UTF-8')
} else {
    logError(`ERROR ${id}: missing response`)
    fs.writeFileSync(lastLeftPart(path,'.') + `.e.${model}.json`, JSON.stringify(res, undefined, 4), 'UTF-8')
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
