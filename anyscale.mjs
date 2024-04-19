#!/usr/bin/env node

import { useClient } from "./lib.mjs"
import { Readable } from "stream"

async function processArgs(args) {

    const model = args[0]
    const cmd = args[1]
    const content = args[2] || ''

    const { getJson, send, openAi } = useClient()
    const API_KEY = process.env.ANYSCALE_API_KEY
    const BASE_URL = `https://api.endpoints.anyscale.com/v1`

    if (cmd === 'chat') {
        // USAGE: ./anyscale.mjs mixtral chat "How do I install nodejs?"
        const content = args.slice(2).join(' ')
        const url = `${BASE_URL}/chat/completions`
        const reqOptions = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': `application/json`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'user', content }
                ],
                temperature: 0.7,
                stream: false
            })
        }

        // console.log(url, reqOptions)
        const r = await fetch(url, reqOptions)

        const txt = await r.text()
        const obj = txt.length > 0 ? JSON.parse(txt) : null
        // console.log('obj',obj)
        const responseContent = txt.length > 0 && obj?.choices?.length > 0 && obj.choices[0].message?.content
        if (responseContent) {
            console.log('\n\n' + responseContent + '\n')
        } else {
            console.log(`Empty response: ${r.status} ${r.statusText}`, txt)
        }
    }
    else if (cmd === 'openai') {
        // USAGE: ./anyscale.mjs mixtral openai "Write a function to reverse a string in javascript."
        const r = await openAi({ model, content })
        const txt = await r.text()
        const obj = txt.length > 0 ? JSON.parse(txt) : null
        // console.log('obj', obj)
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
            `\n# Use chat API`,
            `  ./anyscale.mjs "mistralai/Mistral-7B-Instruct-v0.1" chat "Write a function to reverse a string in javascript."`,
            `\n# Use Open AI API`,
            `  ./anyscale.mjs mixtral openai "How do I install nodejs?"`].join('\n') + '\n')
    }
}

await processArgs(process.argv.slice(2))
