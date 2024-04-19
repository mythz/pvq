#!/usr/bin/env node

import { useClient } from "./lib.mjs"
import { Readable } from "stream"

async function processArgs(args) {

    const model = args[0]
    const cmd = args[1]
    const content = args[2] || ''
    const taggedModel = !model ? null : model.indexOf(':') >= 0 ? model : `${model}:latest`

    const { getJson, send, openAi } = useClient()
    const RUNPOD_URL = process.env.RUNPOD_URL
    // baseUrl(RUNPOD_URL)

    // USAGE: ./runpod.mjs mixtral init
    if (cmd === 'init') {
        const obj = await getJson(`${RUNPOD_URL}/api/tags`)
        const { models } = obj
        // console.log('models:', models)
        
        const modelInfo = models.find(x => x.model === taggedModel)

        if (!modelInfo) {
            console.log(`${model} not loaded, loading ${taggedModel}...`)
            const r = await send(`${RUNPOD_URL}/api/pull`, 'POST', JSON.stringify({
                name: model,
            }))
            Readable.fromWeb(r.body).pipe(process.stdout)
        }
        else if (taggedModel) {
            console.log(`${model} already loaded`, modelInfo)
        }
    }
    else if (cmd === 'chat') {
        // USAGE: ./runpod.mjs mixtral chat "How do I install nodejs?"
        const text = args.slice(2).join(' ')
        const r = await send(`${RUNPOD_URL}/api/chat`, 'POST', JSON.stringify({
            model,
            messages: [
                { role: 'user', content }
            ],
            stream: false
        }))
        const txt = await r.text()
        const obj = txt.length > 0 ? JSON.parse(txt) : null
        // console.log('obj',obj)
        const responseContent = txt.length > 0 && obj?.message?.content
        if (responseContent) {
            console.log('\n\n' + responseContent + '\n')
        } else {
            console.log(`Empty response`)
        }
    }
    else if (cmd === 'openai') {
        // USAGE: ./runpod.mjs mixtral openai "Write a function to reverse a string in javascript."
        const r = await openAi({ model, content })
        const txt = await r.text()
        const obj = txt.length > 0 ? JSON.parse(txt) : null
        console.log('obj',obj)
        const responseContent = txt.length > 0 && obj?.choices?.length > 0 && obj.choices[0].message?.content
        if (responseContent) {
            console.log('\n\n' + responseContent + '\n')
        } else {
            console.log(`Empty response`)
        }
    }
    else {
        if (cmd) {
            console.log(`Unknown command: ${cmd}`)
        }

        console.log(['\nUSAGE:',
        `\n# Set RUNPOD_URL in .env`,
        `   RUNPOD_URL=https://<pod-id>-11434.proxy.runpod.net`,
        `\n# Load model if not already loaded`,
        `  ./runpod.mjs mixtral init`,
        `\n# Use chat API`,
        `  ./runpod.mjs mixtral chat "Write a function to reverse a string in javascript."`,
        `\n# Use Open AI API`,
        `  ./runpod.mjs mixtral openai "How do I install nodejs?"`].join('\n') + '\n')
    }
}

await processArgs(process.argv.slice(2))

