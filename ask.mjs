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

const sleep = ms => new Promise(r => setTimeout(r, ms));

let retry = 0
let elapsed_ms = 0
let txt = null
let res = null

while (retry++ <= 10) {
    let startTime = performance.now()
    let sleepMs = 1000 * retry
    try {
        const content = "Title: " + title + "\n\nTags:" + tags.join(',') + "\n\n" + body
        
        const r = await openAi({ content, model, port, systemPrompt })
        // if (r) {
        //     console.log(`openAi response: ${r.status} ${r.statusText}`)
        //     console.log(r.headers)
        // }
        let endTime = performance.now()
        elapsed_ms = parseInt(endTime - startTime)
        
        logDebug(`=== RESPONSE ${id} in ${elapsed_ms}ms ===\n`)
        txt = await r.text()
        if (!r.ok) {
            console.log(`${r.status} openAi request ${retry + 1} failed: ${txt}`)
            if (r.status === 429) {
                console.log('Rate limited.')
                // Try handle GROQ rate limiting, if not found, defaults to 1000ms
                let rateLimit = groqRateLimiting(txt);
                if (rateLimit.found)
                    sleepMs = rateLimit.waitTime
            }
        } else {
            res = openAiResponse(txt, model)
        }
        if (res) break
    } catch (e) {
        logError(`Failed:`, e)
    }
    console.log(`retrying in ${sleepMs}ms...`)
    await sleep(sleepMs)
}

const safeModel = openAiFromModel(model).replace(/:/g,'-')
const errorFileName = lastLeftPart(path,'.') + `.e.${safeModel}.json`
if (!res) {
    if (!txt) {
        logError(`Failed to get response after ${retry} retries`)
        process.exit()
    }
    logError(`ERROR ${id}: missing response ${retry} retries:\n${txt}`)
    fs.writeFileSync(errorFileName, txt, 'UTF-8')
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
if (content) {
    logInfo(`id:${id}, created:${created}, model:${model}, temperature:${temperature}, elapsed_ms:${elapsed_ms}, choices:${res.choices.length}, size:${content.length}`)
    logDebug(content)
    fs.writeFileSync(lastLeftPart(path,'.') + `.a.${safeModel}.json`, JSON.stringify(res, undefined, 2), 'UTF-8')
    fs.rmSync(errorFileName, { force:true })
} else {
    logError(`ERROR ${id}: missing response:\n${JSON.stringify(res, undefined, 2)}`)
    fs.writeFileSync(errorFileName, JSON.stringify(res, undefined, 2), 'UTF-8')
}
logDebug(`\n=== END RESPONSE ${id} in ${elapsed_ms}ms ===\n\n`)
// Explicitly exit to avoid hanging
process.exit(0);