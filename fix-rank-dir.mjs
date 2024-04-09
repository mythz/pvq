#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const dir = process.argv[2]
let modelName = process.argv[3]
let port = process.argv[4]

if (!dir || !fs.existsSync(dir)) {
    console.log('Directory does not exist', dir)
    process.exit()
}

let fileCount = 0

function processDir(dirPath) {
    const nodes = fs.readdirSync(dirPath)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))
    const reasonIds = files.filter(x => x.endsWith(`.reasons.json`)).map(x => x.split('.')[0])

    const candidates = files.filter(x => x.indexOf(`.validation.`) > -1 && !reasonIds.includes(x.split('.')[0]))

    candidates.forEach(file => {
        if(file.endsWith('.validation.json')) {
            // Skip, old validation file
            return;
        }
        console.log(`${fileCount++}: ./fix-rank-file.mjs ${path.join(dirPath, file)} ${modelName} ${port}`)
        const r = execSync(`./fix-rank-file.mjs ${path.join(dirPath, file)} ${modelName} ${port}`).toString()
        console.log(r)
    })

    subDirs.forEach(subDir => processDir(path.join(dirPath, subDir)))
}

processDir(dir)