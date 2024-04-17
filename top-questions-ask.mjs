#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import {idParts, openAiFromModel} from "./lib.mjs";

const questionsFile = process.argv[2]
let model = process.argv[3]
let port = process.argv[4] ?? '11434'

if (!model) throw "model required"

if (!questionsFile || !fs.existsSync(questionsFile)) {
    console.log('questionsFile does not exist', questionsFile)
    process.exit()
}

let safeModelName = openAiFromModel(model).replace(/:/g, '-')

function processQuestions(questionsFile) {
    const questions = fs.readFileSync(questionsFile, 'utf-8').split('\n').filter(x => x.trim().length > 0)
    questions.forEach((questionId, i) => {
        // Find the question file from the questionId
        // 000.json
        let questionPath = path.join(idParts(questionId).questionPath)
        // Check if answer file exists
        let answerPath = path.join(idParts(questionId).questionPath.replace('.json', `.a.${safeModelName}.json`))
        if (fs.existsSync(answerPath)) {
            console.log(`Answer already exists: ${i}: ${questionId} ${model}`)
            return
        }
        console.log(`${i}: ./ask.mjs "${questionId}" ${model}`)
        try {
            const r = execSync(`./ask.mjs "${questionPath}" ${model} ${port}`, { timeout: 60*1000 }).toString()
            console.log(r)
        } catch(e) {
            console.log('ERROR execSync:', e)
        }
    })
}

processQuestions(questionsFile)
