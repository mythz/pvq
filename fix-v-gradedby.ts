#!/usr/bin/env bun

/**
 * This script is used to fix the gradedBy field in the v.json files.
 */

import fs from "fs"
import path from "path"
import { rightPart, modelToUser } from "./lib.mjs"

const dir = process.argv[2] || './meta'

const totalGraders = {
}
let count = 0

const modelVotesNames = new Set()
const modelReasonsNames = new Set()
const gradedByNames = new Set()

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.v.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        const vObj = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))

        const modelVotes = {}
        if (vObj.modelVotes) {
            Object.keys(vObj.modelVotes).forEach(model => {
                modelVotes[modelToUser(model)] = vObj.modelVotes[model]
            })
        }
        vObj.modelVotes = modelVotes

        const modelReasons = {}
        if (vObj.modelReasons) {
            Object.keys(vObj.modelReasons).forEach(model => {
                modelReasons[modelToUser(model)] = vObj.modelReasons[model]
            })
        }
        vObj.modelReasons = modelReasons

        const gradedBy = {}
        if (vObj.gradedBy) {
            const graders = Object.keys(vObj.gradedBy)
            const isOldGradedBy = graders.length > 0 && Array.isArray(vObj.gradedBy[graders[0]])
            // console.log(file, isOldGradedBy)
            if (!isOldGradedBy) {
                return
            }
            graders.forEach(grader => {
                const graderUser = modelToUser(grader)
                totalGraders[graderUser] = (totalGraders[graderUser] || 0) + vObj.gradedBy[grader].length
                vObj.gradedBy[grader].forEach(answerId => {
                    const userName = rightPart(answerId,'-')
                    gradedBy[userName] = graderUser
                })
            })
        }
        vObj.gradedBy = gradedBy
        if (++count % 1000 == 0) {
            console.log(count, `${path.join(dir,file)}`)
            console.log(vObj.gradedBy)
        }
        fs.writeFileSync(path.join(dir, file), JSON.stringify(vObj, null, 4))

        Object.keys(vObj.modelVotes).forEach(model => modelVotesNames.add(model))
        Object.keys(vObj.modelReasons).forEach(model => modelReasonsNames.add(model))
        Object.keys(vObj.gradedBy).forEach(model => gradedByNames.add(model))
    })

    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)


console.log('\ntotals:')
console.log(totalGraders)

console.log('\nmodel names:', {
    modelVotesNames: Array.from(modelVotesNames),
    modelReasonsNames: Array.from(modelReasonsNames),
    gradedByNames: Array.from(gradedByNames),
})