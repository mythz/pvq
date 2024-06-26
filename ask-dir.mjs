#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const dir = process.argv[2]
let model = process.argv[3]
let port = process.argv[4] ?? '11434'
let fileCount = isNaN(process.argv[5]) ? 0 : parseInt(process.argv[5])

if (!model) throw "model required"

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))
    
    const safeModel = model.replace(/:/g,'-')
    const answerIds = files.filter(x => x.endsWith(`.a.${safeModel}.json`)).map(x => x.split('.')[0])
    const questionLength = '000.json'.length
    const candidates = files.filter(x => x.length == questionLength && x.endsWith('.json') && !answerIds.includes(x.split('.')[0]))
    
    candidates.forEach(file => {
        console.log(`${fileCount++}: ./ask.mjs ${path.join(dir,file)} ${model}`)
        try {
            const r = execSync(`./ask.mjs ${path.join(dir,file)} ${model} ${port}`, { timeout: 60*1000 }).toString()
            console.log(r)
        } catch(e) {
            console.log('ERROR execSync:', e)
        }
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
