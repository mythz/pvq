import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import {extractIdFromPath, idParts, lastLeftPart, lastRightPart, leftPart, openAiFromModel} from "./lib.mjs";

const dir = process.argv[2]
let rankingModel = process.argv[3]
let port = process.argv[4] ?? '11434'
if (!rankingModel) throw "model required"

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

rankingModel = openAiFromModel(rankingModel)

let fileCount = 0

let modelCountMap = {}
function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const safeRankingModel = rankingModel.replace(/:/g, '-')
    const answerFiles = files.filter(x => x.indexOf(`.a.`) > -1)
    let candidates = answerFiles.filter(answerFile => {
        // Grab Id from file name
        const id = extractIdFromPath(path.join(dir, answerFile))
        let modelName = lastLeftPart(lastRightPart(answerFile, '.a.'), '.')
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
    console.log(`${key}: ${value}`)
}