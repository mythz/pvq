#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const dir = process.argv[2]
let model = process.argv[3]
let port = process.argv[4] ?? '11434'
if (!model) throw "model required"

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

let fileCount = 0
function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const safeModel = model.replace(/:/g,'-')
    const questionLength = '000.json'.length
    const candidates = files.filter(x => x.length == questionLength && x.endsWith('.json'))

    candidates.forEach(file => {
        // If the votes result file doesn't already exist, process, otherwise skip
        // Get Id from file name
        const id = file.split('.')[0]
        const votesFile = path.join(dir,`${id}.v.json`)
        if (fs.existsSync(votesFile)) {
            //console.log(`skipping: ${file}`)
            return
        }
        console.log(`${fileCount++}: ./rank.mjs ${path.join(dir,file)} ${model} ${port}`)
        const r = execSync(`./rank.mjs ${path.join(dir,file)} ${model} ${port}`).toString()
        console.log(r)
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)