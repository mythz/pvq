#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { rightPart } from "./lib.mjs"

const dir = process.argv[2] || './meta'

const totals = {
    vFiles: 0,
    modelVotes: 0,
    modelReasons: 0,
    vFilesWithMissingGrades: 0,
    missingGrades: 0,
}

const errorFiles = []

const graderTotals = {
}

const officialGraders = ['mixtral','gemini-pro','command-r','claude3-sonnet']

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const vFiles = files.filter(x => x.endsWith('.v.json'))
    totals.vFiles += vFiles.length

    vFiles.forEach(vFile => {
        const vPath = path.join(dir, vFile)
        const vJson = fs.readFileSync(vPath, 'utf-8')

        let vObj = null

        try {
            vObj = JSON.parse(vJson)
        } catch (e) {
            console.log('error parsing', vPath)
            errorFiles.push(vPath)
            return
        }

        const { modelVotes, modelReasons, gradedBy } = vObj

        if (!modelVotes || !modelReasons || !gradedBy) {
            errorFiles.push(vPath)
            return
        }

        const modelVotesCount = Object.keys(modelVotes).length
        const modelReasonsCount = Object.keys(modelReasons).length

        if (modelVotesCount !== modelReasonsCount) {
            errorFiles.push(vPath)
            return
        }

        totals.modelVotes += modelVotesCount
        totals.modelReasons += modelReasonsCount

        const missingGrades = new Set(Object.keys(modelVotes))

        Object.keys(gradedBy).forEach(grader => {
            if (!officialGraders.includes(grader) && !grader.startsWith('claude3-sonnet')) {
                console.log(`unknown grader: ${grader} in ${vPath}`)
            }
            gradedBy[grader].forEach(model => missingGrades.delete(rightPart(model,'-')))

            if (!graderTotals[grader]) {
                graderTotals[grader] = 0
            }
            graderTotals[grader] += gradedBy[grader].length
        })

        if (missingGrades.size > 0)
        {
            console.log(`${missingGrades.size} missing grades: ${Array.from(missingGrades)} in ${vPath}`)
            totals.vFilesWithMissingGrades += 1
            totals.missingGrades += missingGrades.size
        }
    })

    subDirs.forEach(subDir => processDir(path.join(dir, subDir)))
}

processDir(dir)

console.log('errorFiles', errorFiles)
console.log('totals', totals)
console.log('graderTotals', JSON.stringify(graderTotals, undefined, 4))

console.log('\nTotal Graded:', Object.values(graderTotals).reduce((a, b) => a + b, 0))
