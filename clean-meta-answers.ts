#!/usr/bin/env bun

/*
 * Checks for and removes any references to missing answers which no longer exit from .meta.json files 
 */


import type { Post, Meta } from "./lib-view"
import fs from "fs"
import path from "path"
import { createErrorLog, extractIdFromPath, userNameFromPath, rightPart, lastRightPart, leftPart } from "./lib.mjs"

const dir = process.argv[2] || 'questions'

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}


const logError = createErrorLog(process.argv[1], { reset:true })

function moveBadFile(targetPath: string) {
    const toPath = targetPath.replace('questions/', 'bad/')
    console.log(`mv ${targetPath} ${toPath}`)
    fs.mkdirSync(path.dirname(toPath), { recursive: true })
    fs.renameSync(targetPath, toPath)
}

let count = 0

function processDir(dir:string) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.meta.json'))
    // const answerFiles = nodes.filter(x => x.includes('.h.'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        const fileId = leftPart(file, '.meta.json')
        const questionPath = path.join(dir, fileId + '.json')

        if (!fs.existsSync(questionPath)) {
            const questionFiles = nodes.filter(x => x.startsWith(`${fileId}.`))
            questionFiles.forEach(x => moveBadFile(path.join(dir, x)))
            logError(`${file} missing question, moved: ${questionFiles.join(', ')}`)
            return
        }

        const metaPath = path.join(dir, file)
        const metaJson = fs.readFileSync(metaPath, 'utf-8')
        const postId = extractIdFromPath(metaPath)
        const meta:Meta = JSON.parse(metaJson)

        let { modelVotes, modelReasons, gradedBy, comments, statTotals } = meta

        let shouldUpdate = !(modelVotes && modelReasons && gradedBy && comments && statTotals)
        if (!modelVotes) modelVotes = {}
        if (!modelReasons) modelReasons = {}
        if (!gradedBy) gradedBy = {}
        if (!comments) comments = {}
        if (!statTotals) statTotals = []

        const modelVoteUsers = Object.keys(modelVotes)
        const modelReasonUsers = Object.keys(modelReasons)
        const gradedByUsers = Object.keys(gradedBy)
        const commentAnswerUsers = Object.keys(comments).filter(x => x.includes('-'))
        const statTotalAnswerUsers = statTotals.filter(x => x.id.includes('-')).map(x => rightPart(x.id, '-'))
        
        const allAnswerUserNames = new Set(modelVoteUsers
            .concat(modelReasonUsers)
            .concat(gradedByUsers)
            .concat(commentAnswerUsers)
            .concat(statTotalAnswerUsers))

        const answerFiles = nodes.filter(x => x.startsWith(`${fileId}.h.`))
        const answerUserNames = answerFiles.map(x => userNameFromPath(x))
        const usersToRemove = Array.from(allAnswerUserNames).filter(x => !answerUserNames.includes(x))

        const sections:string[] = []
        if (usersToRemove.length > 0) {
            shouldUpdate = true
            if (modelVoteUsers.some(x => usersToRemove.includes(x))) {
                sections.push(`modelVotes`)
                for (const user of usersToRemove) {
                    delete modelVotes[user]
                }
                meta.modelVotes = modelVotes
            }
            if (modelReasonUsers.some(x => usersToRemove.includes(x))) {
                sections.push(`modelReasons`)
                for (const user of usersToRemove) {
                    delete modelReasons[user]
                }
                meta.modelReasons = modelReasons
            }
            if (gradedByUsers.some(x => usersToRemove.includes(x))) {
                sections.push(`gradedBy`)
                for (const user of usersToRemove) {
                    delete gradedBy[user]
                }
                meta.gradedBy = gradedBy
            }
            if (commentAnswerUsers.some(x => usersToRemove.includes(x))) {
                sections.push(`comments`)
                for (const user of usersToRemove) {
                    delete comments[user]
                }
                meta.comments = comments
            }
            if (statTotalAnswerUsers.some(x => usersToRemove.includes(x))) {
                sections.push(`statTotals`)
                statTotals = statTotals.filter(x => !(x.id.includes('-') && usersToRemove.includes(rightPart(x.id, '-'))))
                meta.statTotals = statTotals
            }
        }
        
        if (shouldUpdate) {
            console.log(postId, "removed", usersToRemove, "from", sections)
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
        }
    })
    
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
