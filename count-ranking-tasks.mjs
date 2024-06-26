#!/usr/bin/env node

import fs from "fs"
import path from "path"
import {
    extractIdFromPath,
    idParts,
    lastLeftPart,
    lastRightPart,
    splitOnFirst,
    openAiFromModel,
} from "./lib.mjs";

const dir = process.argv[2] || './questions'
let rankingModel = process.argv[3] || 'mixtral'
let port = process.argv[4] ?? '11434'
if (!rankingModel) throw "model required"

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

rankingModel = openAiFromModel(rankingModel)

let fileCount = 0
let doneCount = 0

let modelCountMap = {}
let doneModelCountMap = {}
let idsAlreadyCounted = []

let scoreRankerMap = {}
function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const safeRankingModel = rankingModel.replace(/:/g, '-')
    const answerFiles = files.filter(x => x.indexOf(`.a.`) > -1)
    let candidates = answerFiles.filter(answerFile => {
        // Grab Id from file name
        const id = extractIdFromPath(path.join(dir, answerFile))
        let modelName = lastLeftPart(lastRightPart(answerFile, '/').substring('000.a.'.length), '.')
        let idDirParts = idParts(id)
        let answerModel = openAiFromModel(modelName)
        // Check if the votes file exists
        const votesFile = path.join(idDirParts.metaDir, `${idDirParts.fileId}.v.json`)
        let votesExist = fs.existsSync(votesFile)
        if (!votesExist)
            return true

        // Check if the votes file is empty
        let votesJson = fs.readFileSync(votesFile, 'utf-8')
        if (votesJson.length === 0)
            return true

        let votesData = JSON.parse(votesJson)

        // First count what has been done if possible
        if (votesData.gradedBy != null && !idsAlreadyCounted.includes(id)) {
            for(let m in votesData.gradedBy) {
                let graded = votesData.gradedBy[m].length;
                doneCount += graded
                let doneModels = votesData.gradedBy[m].map(x => splitOnFirst(x, '-')[1])
                doneModels.forEach(model => {
                    doneModelCountMap[model] = (doneModelCountMap[model] || 0) + 1
                })

                votesData.gradedBy[m].forEach(gradedBy => {
                    let model = splitOnFirst(gradedBy, '-')[1]
                    let score = votesData.modelVotes[model]
                    if (score == null) return
                    if(scoreRankerMap[m] == null) scoreRankerMap[m] = {}
                    if(scoreRankerMap[m][model] == null) scoreRankerMap[m][model] = {}
                    if(scoreRankerMap[m][model].score == null) scoreRankerMap[m][model].score = 0
                    scoreRankerMap[m][model].score += score
                    scoreRankerMap[m][model].count = (scoreRankerMap[m][model].count || 0) + 1
                })
            }
            idsAlreadyCounted.push(id)
        }

        if (votesData.modelVotes == null || votesData.modelVotes[answerModel] == null)
            return true;

        if (votesData.modelReasons == null || votesData.modelReasons[answerModel] == null)
            return true;

        return false;
    })

    candidates.forEach(file => {
      // Count the number of tasks per model
        const modelName = lastLeftPart(lastRightPart(file, '.a.'), '.')
        modelCountMap[modelName] = (modelCountMap[modelName] || 0) + 1
    })

    fileCount += candidates.length
    subDirs.forEach(subDir => processDir(path.join(dir, subDir)))
}

processDir(dir)

console.log(`Tasks to rank: ${fileCount}`)
console.log('Tasks per model:')
// Print the number of tasks per model
for (const [key, value] of Object.entries(modelCountMap)) {
    console.log(`  ${key}: ${value}`)
}

console.log(`Tasks already graded: ${doneCount}`)
console.log('Tasks per model already graded:')
// Print the number of tasks per model already graded
for (const [key, value] of Object.entries(doneModelCountMap)) {
    console.log(`  ${key}: ${value}`)
}

for(let ranker in scoreRankerMap) {
    for(let model in scoreRankerMap[ranker]) {
        scoreRankerMap[ranker][model].avg = scoreRankerMap[ranker][model].score / scoreRankerMap[ranker][model].count
    }
}

console.log(`Average scores per model:`)
for (const [ranker, models] of Object.entries(scoreRankerMap)) {
    console.log(`Ranker: ${ranker}`)
    for (const [model, score] of Object.entries(models)) {
        console.log(`  ${model}: ${score.avg.toFixed(2)} (${score.count})`)
    }
}