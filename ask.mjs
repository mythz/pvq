#!/usr/bin/env node

import fs from "fs"
import { useClient, useLogging, idParts, lastLeftPart } from "./lib.mjs"

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
    path = idParts(id).questionPath
    if (!fs.existsSync(path)) {
        console.log(`file does not exist: ${path}`)
        process.exit()
    }
}

const json = fs.readFileSync(path, 'utf-8')
const obj = JSON.parse(json)
const id = obj.Id ?? obj.id
const title = obj.Title ?? obj.title
const body = obj.Body ?? obj.body
const tags = obj.Tags ?? obj.tags ?? []

const { logInfo, logDebug, logError } = useLogging()

logDebug(`=== REQUEST ${id} ===`)
logDebug(`${id}, ${path}, ${body}`)
logDebug(`=== END REQUEST ${id} ===\n\n`)

const { openAi, openAiDefaults, openAiFromModel } = useClient()
const { systemPrompt, temperature, maxTokens } = openAiDefaults()

let r = null
let startTime = performance.now()
try {
    const content = "Title: " + title + "\n\nTags:" + tags.join(',') + "\n\n" + body
    
    r = await openAi({ content, model, port, systemPrompt })
} catch (e) {
    logError(`Failed:`, e)
    process.exit()
}
let endTime = performance.now()
let elapsed_ms = parseInt(endTime - startTime)

logDebug(`=== RESPONSE ${id} in ${elapsed_ms}ms ===\n`)
const txt = await r.text()
if (!r.ok) {
    console.log(`${r.status} openAi request failed: ${txt}`)
    process.exit()
}
const res = await JSON.parse(txt)
const created = new Date(1710078197*1000).toISOString()
res.model = openAiFromModel(res.model)
res.request = {
    id,
    created,
    messages: { systemPrompt },
    temperature,
    max_tokens: maxTokens,
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
