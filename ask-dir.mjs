#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const dir = process.argv[2]
if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

let fileCount = 0
function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))
    
    const answerIds = files.filter(x => x.includes('.a.')).map(x => x.split('.')[0])
    const questionLength = '000.json'.length
    const candidates = files.filter(x => x.length == questionLength && x.endsWith('.json') && !answerIds.includes(x.split('.')[0]))
    
    candidates.forEach(file => {
        console.log(`${fileCount++}: ./ask.mjs ${path.join(dir,file)}`)
        const r = execSync(`./ask.mjs ${path.join(dir,file)}`).toString()
        console.log(r)
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
