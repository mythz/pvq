// Scan the questions folder for *.a.* files that don't match a set of known usernames, and rename if possible.

import fs from "fs"
import path from "path"
import { useLogging, lastLeftPart, lastRightPart,openAiFromModel } from "./lib.mjs"

const { logInfo, logDebug, logError } = useLogging()

const questionsBasePath = process.argv[2]

const validNames = [
    'mistral',
    'mixtral',
    'gemma',
    'gpt-4-turbo',
    'claude3-haiku',
    'claude3-sonnet',
    'claude3-opus',
    'phi',
    'deepseek-coder',
    'gemma-2b',
    'codellama',
    'qwen-4b',
    'gemini-pro',
    'deepseek-coder-33b',
]

//

// Recursively scan the questions directory for *.a.* files
function processDir(dir) {
    //logInfo(`Processing ${dir}`)
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const answerFiles = files.filter(x => x.indexOf(`.a.`) > -1)
    // Extract the model name
    const candidates = answerFiles.filter(file => {
        const modelName = lastLeftPart(lastRightPart(file, '.a.'), '.')
        return !validNames.includes(modelName)
    })

    logInfo(`Found ${candidates.length} candidates`)
    //logInfo(candidates)

    candidates.forEach(file => {
        // rename the file if it doesn't match a valid model name
        const modelName = lastLeftPart(lastRightPart(file, '.a.'), '.')
        let updatedModelName = openAiFromModel(modelName).replace(/:/g, '-')
        if(updatedModelName === modelName) {
            return;
        }
        if (validNames.includes(updatedModelName)) {
            // Write the new file
            const oldPath = path.join(dir, file)
            const newPath = path.join(dir, file.replace(modelName, updatedModelName))
            if(fs.existsSync(newPath)) {
                console.log(`skipping: ${file}`)
                fs.rmSync(oldPath)
                return
            }
            console.log(`Renaming ${oldPath} to ${newPath}`)
            fs.renameSync(oldPath, newPath)
        }
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(questionsBasePath)

