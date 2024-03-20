import fs from "fs"
import path from "path"

const dir = process.argv[2]
if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

let fileCount = 0
function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    const metaIds = files.filter(x => x.includes('.meta.')).map(x => x.split('.')[0])
    const questionLength = '000.json'.length
    const candidates = files.filter(x => x.length == questionLength && x.endsWith('.json') && !metaIds.includes(x.split('.')[0]))

    candidates.forEach(file => {
        // Read {file_number}.comment.json file where file_number is the number of the file before .json
        let commentFile = path.join(dir,`${path.parse(file).name}.comment.json`)
        if (!fs.existsSync(commentFile)) {
            // console.log(`Comment file does not exist for ${file}`)
            return
        }
        // Read votes file from {file_number}.v.{model}.json, we can wild card the model part
        let votesFile = files.find(x => x.startsWith(`${path.parse(file).name}.v.`))
        if (!votesFile && !fs.existsSync(votesFile)) {
            console.log(`Votes file ${votesFile} does not exist for ${file}`)
            return
        }

        votesFile = path.join(dir,votesFile)
        console.log(`${fileCount++}: Merging ${file} with ${commentFile} and ${votesFile}`)

        // Read the comment file
        let comment = JSON.parse(fs.readFileSync(commentFile, 'utf-8'))
        // Read the votes file
        let votes = JSON.parse(fs.readFileSync(votesFile, 'utf-8'))
        // Merge the comment and votes file
        let merged = {...comment, ...votes}
        // Write the merged file
        let mergedFile = path.join(dir,`${path.parse(file).name}.meta.json`)
        fs.writeFileSync(mergedFile, JSON.stringify(merged, null, 4))
        console.log(`Merged file written to ${mergedFile}`)
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
    processDir(dir)
}
