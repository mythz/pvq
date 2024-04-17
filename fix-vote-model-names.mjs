import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import {
    extractIdFromPath,
    idParts,
    lastLeftPart,
    lastRightPart,
    leftPart,
    openAiFromModel, rightPart, splitOnFirst,
    splitOnLast
} from "./lib.mjs";

const dir = process.argv[2]
let rankingModel = process.argv[3]
let port = process.argv[4] ?? '11434'
if (!rankingModel) throw "model required"

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

rankingModel = openAiFromModel(rankingModel)

let manualFixes = {
    '7b': 'deepseek-coder'
}

let voteFilesAlreadyProcessed = []
let uniqueModelNames = {}

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
        if (votesData.gradedBy != null && votesData.gradedBy[safeRankingModel] != null && !voteFilesAlreadyProcessed.includes(id)) {
            // Check for the model name in the gradedBy array for invalid usernames and model names that need to be updated
            let graded = votesData.gradedBy[safeRankingModel].length;

            votesData.gradedBy[safeRankingModel].forEach(gradedBy => {
                let currentUsername = rightPart(gradedBy, '-')
                let shouldBeUserName = openAiFromModel(currentUsername)
                if (manualFixes[currentUsername]) {
                    shouldBeUserName = manualFixes[currentUsername]
                }
                if (shouldBeUserName !== currentUsername) {
                    console.log(`${id}.v.json needs updating from ${currentUsername} to ${shouldBeUserName}`)
                    votesData.gradedBy[safeRankingModel] = votesData.gradedBy[safeRankingModel].map(x => x.replace(currentUsername, shouldBeUserName))
                }
                uniqueModelNames[currentUsername] = true
                // Update v.json file
                //fs.writeFileSync(votesFile, JSON.stringify(votesData, null, 4))
                voteFilesAlreadyProcessed.push(id)
            })
        }
    })

    subDirs.forEach(subDir => processDir(path.join(dir, subDir)))
}

processDir(dir)

console.log(`Unique model names: ${Object.keys(uniqueModelNames).length}`)
for(let modelName in uniqueModelNames) {
    console.log(modelName)
}