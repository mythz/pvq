#!/usr/bin/env node

import fs from "fs"
import path from "path"

let id = process.argv[2]

export function getQuestionFiles(id) {
    if (!isNaN(parseInt(id))) {
        const idStr = `${id}`.padStart(9, '0')
        
        const dir1 = idStr.substring(0,3)
        const dir2 = idStr.substring(3,6)
        const file = idStr.substring(6)
        const questionsDir = `questions/${dir1}/${dir2}`
        
        const nodes = fs.readdirSync(questionsDir)
        return nodes.filter(x => x.startsWith(file + '.'))
            .map(x => path.join(questionsDir, x))
    }
    return [] 
}

export function deleteQuestion(id) {
    const questionFiles = getQuestionFiles(id) 
    questionFiles.forEach(x => {
        fs.rmSync()
    })
}
deleteQuestion(id)

