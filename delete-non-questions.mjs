#!/usr/bin/env node

import fs from "fs"
import path from "path"
// import { execSync } from "child_process"

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
    
    const questionLength = '000.json'.length
    const candidates = files.filter(x => x.length == questionLength && x.endsWith('.json'))
    
    candidates.forEach(file => {
        const json = fs.readFileSync(path.join(dir,file))
        const obj = JSON.parse(json)
        if (obj.PostTypeId != 1) {
            const fileId = file.split('.')[0]
            const answers = files.filter(x => x.startsWith(`${fileId}.a.`))
            console.log(`${fileCount++}: ${path.join(dir,file)} ${answers.join(' ')}`)
        }
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
