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
    const files = nodes.filter(x => x.endsWith('.json')).filter(x => x.indexOf(`.validation.`) > -1)
    const subDirs = nodes.filter(x => !x.includes('.'))

    const candidates = files.filter(x => x.indexOf(`.validation.`))

    candidates.forEach(file => {
        // Check if the votes result file already exists, and check if enough votes are present
        // Get Id from file name
        // const id = file.split('.')[0]
        // // Check if the votes file already exists
        // const votesFile = path.join(dirPath, `${id}.v.json`)
        // if (fs.existsSync(votesFile)) {
        //     console.log(`skipping: ${file}`)
        //     // Read JSON, and count modelVotes keys
        //     const data = fs.readFileSync(votesFile, 'utf8')
        //     const jsonData = JSON.parse(data)
        // }
        // if (file.endsWith('.v.json')) {
        //     // If we are here, either the votes file doesn't exist, or it already has enough votes, and doesn't need to be fixed
        //     return
        // }
        console.log(`${fileCount++}: ./fix-rank-file.mjs ${path.join(dirPath, file)} ${modelName} ${port}`)
        const r = execSync(`./fix-rank-file.mjs ${path.join(dirPath, file)} ${modelName} ${port}`).toString()
        console.log(r)
    })

    subDirs.forEach(subDir => processDir(path.join(dirPath, subDir)))
}

processDir(dir)