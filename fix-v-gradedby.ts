#!/usr/bin/env bun

/**
 * This script is used to fix the gradedBy field in the v.json files.
 */

import fs from "fs"
import path from "path"
import { rightPart } from "./lib.mjs"

const dir = process.argv[2] || './meta'

const aliases = {
    'gpt-3.5-turbo': 'gpt3.5-turbo',
    'llama3': 'llama3-8b',
    'llama3:instruct': 'llama3-8b',
    'open-mixtral-8x7b': 'mixtral',
}
function alias(model) {
    return aliases[model] || model
}

const totalGraders = {
}
let count = 0

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.v.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        const vObj = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
        const gradedBy = {}
        if (vObj.gradedBy) {
            const graders = Object.keys(vObj.gradedBy)
            const isOldGradedBy = graders.length > 0 && Array.isArray(vObj.gradedBy[graders[0]])
            // console.log(file, isOldGradedBy)
            if (!isOldGradedBy) {
                return
            }
            graders.forEach(grader => {
                totalGraders[grader] = (totalGraders[grader] || 0) + vObj.gradedBy[grader].length
                vObj.gradedBy[grader].forEach(answerId => {
                    const userName = rightPart(answerId,'-')
                    gradedBy[userName] = alias(grader)
                })
            })
        }
        vObj.gradedBy = gradedBy
        if (++count % 1000 == 0) {
            console.log(count, `${path.join(dir,file)} new gradedBy:`)
            console.log(vObj.gradedBy)
            // fs.writeFileSync(path.join(dir, file), JSON.stringify(vObj, null, 4))
        }
    })

    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)


console.log('\ntotals:')
console.log(totalGraders)
