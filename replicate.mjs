#!/usr/bin/env node

import { useClient, sleep } from "./lib.mjs"
import { Readable } from "stream"

async function processArgs(args) {

    const model = args[0]
    const cmd = args[1]
    const content = args[2] || ''

    const { getJson, send, openAi } = useClient()
    const API_KEY = process.env.REPLICATE_API_KEY
    const BASE_URL = `https://api.replicate.com/v1`

    if (cmd === 'chat') {
        // USAGE: ./replicate.mjs meta/meta-llama-3-70b-instruct chat "How do I install nodejs?"
        const content = args.slice(2).join(' ')
        const url = `${BASE_URL}/models/${model}/predictions`
        const reqOptions = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': `application/json`,
            },
            body: JSON.stringify({
                stream: false,
                input: {
                    prompt: content,
                    prompt_template: "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n",
                    temperature: 0.7,
                },
            })
        }

        console.log(url, reqOptions)
        let r = await fetch(url, reqOptions)

        let txt = await r.text()
        let obj = txt.length > 0 ? JSON.parse(txt) : null
        console.log('obj',obj)

        const { get, cancel } = obj.urls
        let status = ''
        while (true) {
            r = await fetch(get, { method: 'GET', headers: { Authorization: `Bearer ${API_KEY}` } })
            txt = await r.text()
            obj = txt.length > 0 ? JSON.parse(txt) : null
            const { status, output } = obj

            if (status !== 'starting' && status !== 'processing') {
                break
            }
            console.log(`\n\n========================`)
            console.log(status)
            console.log(`========================\n`)
            console.log(output?.join('') ?? '')
            console.log(`\n========================\n`)
            console.log('Still processing, waiting 1s...\n\n')
            await sleep(1000)
        }

        console.log('\n\n' + obj.status)
        console.log(typeof obj.output === 'string' ? obj.output : obj.output.join(''))
        console.log('\nmetrics')
        console.log(obj.metrics)
    }
    else {
        if (cmd) {
            console.log(`Unknown command: ${cmd}`)
        }

        console.log(['\nUSAGE:',            
            `\n# Use predictions API`,
            `  ./replicate.mjs meta/meta-llama-3-70b-instruct chat "How do I install nodejs?"`].join('\n') + '\n')
    }
}

await processArgs(process.argv.slice(2))
