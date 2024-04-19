#!/usr/bin/env bun
import { Database } from 'bun:sqlite'
import fs from 'fs'
import path from 'path'
import { rightPart, lastLeftPart, idParts, extractIdFromPath } from "./lib.mjs"

const dir = process.argv[2] || './meta'

const taskDbPath = './dist/tasks-missing.db'

if (fs.existsSync(taskDbPath)) {
    fs.rmSync(taskDbPath)
}

const db = new Database(taskDbPath)

interface RankTask {
    Id: string
    PostId: number
    VPath: string
    QuestionPath: string
    MetaPath: string
    AnswerPath: string
}

// Id = AnswerId
db.exec(`CREATE TABLE RankTask (
    Id text primary key,
    PostId integer not null,
    VPath text not null,
    QuestionPath text not null,
    MetaPath text not null,
    AnswerPath text not null
)`)

const insert = db.prepare(
    `INSERT INTO RankTask (Id,PostId,VPath,QuestionPath,MetaPath,AnswerPath) VALUES ($id,$postId,$vPath,$questionPath,$metaPath,$answerPath)`)
const tasks:any[] = []

let count = 0

function processDir(dir:string) {
    // if (count > 10) {
    //     return
    // }

    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const vFiles = files.filter(x => x.endsWith('.v.json'))

    vFiles.forEach(vFile => {
        const vPath = path.join(dir, vFile)
        const vJson = fs.readFileSync(vPath, 'utf-8')
        const postId = extractIdFromPath(vPath)

        if (isNaN(postId)) {
            console.log(`error postId ${postId} in ${vPath}`)
            return
        }

        const { questionDir, fileId, questionPath, metaPath } = idParts(postId)
        const answers = fs.readdirSync(questionDir)
            .filter(x => x.startsWith(`${fileId}.a.`) || x.startsWith(`${fileId}.h.`))

        const answerModels = answers.map(x => lastLeftPart(x.substring('000.a.'.length), '.'))
        // const answerIds = answerModels.map(userName => `${postId}-${userName}`)
        // console.log('answerModels', answerModels)
        // console.log('answerIds', answerIds)

        let vObj = null

        try {
            vObj = JSON.parse(vJson)
        } catch (e) {
            console.log(`error parsing ${vPath}`)
            return
        }

        const { modelVotes, modelReasons, gradedBy } = vObj as any

        if (!modelVotes || !modelReasons || !gradedBy) {
            console.log(`error incomplete in ${vPath}`)
            return
        }

        const modelVotesCount = Object.keys(modelVotes).length
        const modelReasonsCount = Object.keys(modelReasons).length

        if (modelVotesCount !== modelReasonsCount) {
            console.log(`error model ${modelVotesCount} votes != ${modelReasonsCount} reasons in ${vPath}`)
            return
        }

        const rankedModels = Object.keys(modelVotes)
        const missingModels = answerModels.filter(model => !rankedModels.includes(model))

        if (missingModels.length == 0) {
            return
        }

        if (count % 100 == 0) {
            console.log(`${count} missingModels in ${vPath}`, missingModels)
        }
        missingModels.forEach(model => {
            const id = `${postId}-${model}` // answerId
            const kind = model == 'accepted' || model == 'most-voted' ? 'h' : 'a'
            const answerPath = path.join(questionDir, `${fileId}.${kind}.${model}.json`)

            if (model === 'accepted') {
                const mostVotedPath = path.join(questionDir, `${fileId}.${kind}.most-voted.json`)
                const acceptedSize = fs.existsSync(answerPath) ? fs.statSync(answerPath).size : 0
                const mostVotedSize = fs.existsSync(mostVotedPath) ? fs.statSync(mostVotedPath).size : 0
                if (acceptedSize === mostVotedSize || acceptedSize === 0) {
                    return
                }
            }

           if (!fs.existsSync(vPath)) {
                console.log(`error missing v file ${vPath}`)
                return
            }
            if (!fs.existsSync(questionPath)) {
                console.log(`error missing question file ${questionPath} in ${vPath}`)
                return
            }
            if (!fs.existsSync(metaPath)) {
                console.log(`error missing meta file ${metaPath} in ${vPath}`)
                return
            }
            if (!fs.existsSync(answerPath)) {
                console.log(`error missing answer file ${answerPath} in ${vPath}`)
                return
            }
            const task = { 
                $id: id, 
                $postId: postId, 
                $vPath: vPath, 
                $questionPath: questionPath, 
                $metaPath: metaPath,
                $answerPath: answerPath, 
            }
            try {
                insert.run(task)
                count++
            } catch(e) {
                console.log(`failed to insert task ${id} in ${vPath}`, e)
            }
        })
    })

    subDirs.forEach(subDir => processDir(path.join(dir, subDir)))
}

processDir(dir)

const query = db.query('SELECT COUNT(*) FROM RankTask')
console.log('RankTasks', query.get())

insert.close()
db.close(true)
