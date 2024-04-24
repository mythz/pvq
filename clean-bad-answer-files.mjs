#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import {extractIdFromPath, idParts, splitOnFirst, lastRightPart, leftPart, openAiFromModel} from "./lib.mjs";

const dir = process.argv[2]
if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

let fileCount = 0

// Read ./data/bad_ids.txt which is a new line separated list of answer ids that are bad
const badIds = fs.readFileSync('./data/bad_ids.txt', 'utf-8').split('\n')

badIds.forEach(badId => {
    const badNumber = splitOnFirst(badId, '-')[0]
    const badModel = splitOnFirst(badId, '-')[1]
    const idPathDetails = idParts(badNumber)
    // replace end `.json` with matching answer file pattern of `.a.${model}.json`
    const badAnswerFile = `${idPathDetails.questionPath.replace('.json', `.a.${badModel}.json`)}`
    // Check if exists
    if (fs.existsSync(badAnswerFile)) {
        console.log(`Bad answer file exists: ${badAnswerFile}`)
        // Delete bad answer file
        fs.unlinkSync(badAnswerFile)
    }
})