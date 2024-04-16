#!/usr/bin/env node

/**
 * Regenrates *.v.json files from *.reasons.mixtral.json files
 **/

import fs from "fs"
import path from "path"
import { openAiFromModel, emptyVFile, leftPart, rightPart } from "./lib.mjs"

const dir = process.argv[2]

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

let fileCount = 0

/** 000.reasons.mixtral.json
{
   "deepseek-coder-6.7b": {
        "score": 9,
        "reason": "The answer is correct and provides a clear solution."
    }
}
*/

function processDir(dir) {
    console.log(`processDir ${dir}...`)
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const questionLength = '000.json'.length
    const questionFiles = files.filter(x => x.length == questionLength && x.endsWith('.json'))
    
    questionFiles.forEach(file => {

        const metaDir = path.join('meta', rightPart(dir, '/'))
        const postIdSuffix = leftPart(file, '.')
        const reasonsFile = path.join(metaDir, `${postIdSuffix}.reasons.mixtral.json`)
        const vFile = path.join(metaDir, `${postIdSuffix}.v.json`)

        const vObj = emptyVFile()
        fs.mkdirSync(metaDir, { recursive: true })

        if (!fs.existsSync(reasonsFile)) {
            console.log(`regenerating missing: ${vFile}...`)
            fs.writeFileSync(vFile, JSON.stringify(vObj, null, 2))
            return
        }

        const reasonsJson = fs.readFileSync(reasonsFile, 'utf-8')
        const reasonsObj = JSON.parse(reasonsJson)

        Object.keys(reasonsObj).forEach(model => {
            const entry = reasonsObj[model]
            const userName = openAiFromModel(model)
            if (entry && entry.score != null && entry.reason) {
                vObj.modelVotes[userName] = entry.score
                vObj.modelReasons[userName] = entry.reason
            }
        })

        console.log(`${fileCount++}: writing ${vFile} with ${Object.keys(reasonsObj).join(',')} models...`)
        // if (fileCount > 40) process.exit()
        fs.writeFileSync(vFile, JSON.stringify(vObj, null, 2))
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
