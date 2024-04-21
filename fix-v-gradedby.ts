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
        const vPath = path.join(dir, file)
        try {
            const vObj = JSON.parse(fs.readFileSync(vPath, 'utf-8'))
            let shouldSave = false

            const modelVotes = {}
            if (vObj.modelVotes) {
                Object.keys(vObj.modelVotes).forEach(model => {
                    let score = vObj.modelVotes[model]
                    if (!Number.isSafeInteger(score)) {
                        if (isNaN(score)) {
                            console.log(vPath, model, `changing score from ${score} to 0`)
                            score = 0
                        } else {
                            console.log(vPath, model, `changing score from ${score} to ${Math.floor(score)}`)
                            score = Math.floor(score)
                        }
                        shouldSave = true
                    }
                    modelVotes[modelToUser(model)] = score
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
                const entries = Object.entries(vObj.gradedBy)
                const isOldGradedBy = entries.length > 0 && Array.isArray(Object.entries(entries)[0][1])
                if (entries.length > 0 && !isOldGradedBy) {
                    console.log(vPath, `upgrading old gradedBy`)
                    Object.keys(vObj.gradedBy).forEach(grader => {
                        const graderUser = modelToUser(grader)
                        totalGraders[graderUser] = (totalGraders[graderUser] || 0) + vObj.gradedBy[grader].length
                        vObj.gradedBy[grader].forEach(answerId => {
                            const userName = rightPart(answerId,'-')
                            gradedBy[userName] = graderUser
                        })
                    })
                    shouldSave = true
                    vObj.gradedBy = gradedBy
                }
            }
            if (!shouldSave) return
            console.log(++count, `${path.join(dir,file)}`, vObj.gradedBy)
            fs.writeFileSync(vPath, JSON.stringify(vObj, null, 4))

            Object.keys(vObj.modelVotes).forEach(model => modelVotesNames.add(model))
            Object.keys(vObj.modelReasons).forEach(model => modelReasonsNames.add(model))
            Object.keys(vObj.gradedBy).forEach(model => gradedByNames.add(model))

        } catch (e) {
            console.error(vPath, e)
        }
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