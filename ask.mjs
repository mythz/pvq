#!/usr/bin/env node

import fs from "fs"
import {useClient, useLogging, idParts, lastLeftPart, groqRateLimiting} from "./lib.mjs"

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

const { openAi, openAiDefaults, openAiFromModel, openAiResponse } = useClient()
const { systemPrompt, temperature, maxTokens } = openAiDefaults()

let r = null
let startTime = performance.now()
try {
    const content = "Title: " + title + "\n\nTags:" + tags.join(',') + "\n\n" + body
    
    r = await openAi({ content, model, port, systemPrompt })
    // if (r) {
    //     console.log(`openAi response: ${r.status} ${r.statusText}`)
    //     console.log(r.headers)
    // }
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
    if (r.status === 429) {
        console.log('Rate limited.')
        // Try handle GROQ rate limiting, if not found, defaults to 1000ms
        let rateLimit = groqRateLimiting(txt);
        if(rateLimit.found)
            await new Promise(resolve => setTimeout(resolve, rateLimit.waitTime))
    }
    process.exit()
}

const res = openAiResponse(txt, model)
if (!res) {
    logError(`ERROR ${id}: missing response:\n${txt}`)
    fs.writeFileSync(lastLeftPart(path,'.') + `.e.${openAiFromModel(model).replace(/:/g,'-')}.json`, txt, 'UTF-8')
    process.exit()
}

const created = new Date().toISOString()
res.model = openAiFromModel(res.model)
res.request = {
    id,
    created,
    messages: { systemPrompt },
    temperature,
    max_tokens: maxTokens,
    elapsed_ms,
}

const content = res.choices?.[0]?.message?.content
const safeModel = model.replace(/:/g,'-')
if (content) {
    logInfo(`id:${id}, created:${created}, model:${model}, temperature:${temperature}, elapsed_ms:${elapsed_ms}, choices:${res.choices.length}, size:${content.length}`)
    logDebug(content)
    fs.writeFileSync(lastLeftPart(path,'.') + `.a.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
} else {
    logError(`ERROR ${id}: missing response:\n${JSON.stringify(res, undefined, 2)}`)
    fs.writeFileSync(lastLeftPart(path,'.') + `.e.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
}
logDebug(`\n=== END RESPONSE ${id} in ${elapsed_ms}ms ===\n\n`)
// Explicitly exit to avoid hanging
process.exit(0);