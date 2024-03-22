import readDotEnv from "../load-env.mjs";
import askOllama from "../ollama.mjs"

const model = process.argv[2]
const workerId = process.argv[3]
const jobType = process.argv[4] ?? 'ask'
const provider = process.argv[5] ?? 'ollama'
const port = process.argv[6] ?? '11434'


if (!model) {
    console.log('models required')
    process.exit()
}

if (!workerId) {
    console.log('workerId required')
    process.exit()
}

// Models available to use
const models = model.split(',')

const jobOptions = {
    "ask": { "endpoint": "https://pvq.app/jobs" },
    "ask-local": { "endpoint": "http://localhost:5000/jobs"}
}

const modelDetails = {
    "mistral" : { "name": "mistral" },
    "gemma" : { "name": "gemma" },
    "gemma:2b" : { "name": "gemma-2b" },
    "codellama" : { "name": "codellama" },
}

// Read the .env file
readDotEnv();

// Long poll to the jobUrl checking for new tasks
async function pollJob(jobType,models,workerId) {
    let jobUrl = jobOptions[jobType].endpoint
    let url = `${jobUrl}?workerId=${workerId}&models=${models.join(',')}`
    let res = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
    });
    console.log(`Polling ${url}`)
    console.log(res);
    return await res.json()
}


async function processJobs(jobType, models, workerId, provider, port) {
    let jobs = await pollJob(jobType,models,workerId)
    if (jobs.results != null && jobs.results.length > 0) {
        let post = jobs.results[0];
        let modelToUse = jobs.model ?? models[0]
        // Ensure the models is in the list of available models
        if (!models.includes(modelToUse)) {
            console.log(`Model ${modelToUse} not available, using fallback model ${models[0]}`)
            modelToUse = models[0]
        }
        let answer = await generateAnswer(post, modelToUse, provider, port)
        let res = await fetch(`${jobUrl}/${jobs.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({postId: post.id, jobId: jobs.id, body: answer, userName: modelDetails[modelToUse].name, workerId: workerId, model: modelToUse})
        })
        let resJson = await res.json()
        console.log(resJson)
    } else {
        console.log('No jobs found')
    }
}

async function generateAnswer(postDto, model,provider, port) {
    let body = postDto.body
    let title = postDto.title
    let tags = postDto.tags
    let id = postDto.id
    let jobId = postDto.jobId

    let system = {"role": "system", "content": "You are a friendly AI Assistant that helps answer developer questions. A user has a technical question with the following details: "}
    let user = {"role": "user", "content": `A user has a technical question with the following details:\n\nTitle: ${title}Tags: ${tags}\n\nBody: ${body}\n\n End of details. Please answer their question. Think step by step and provide a detailed answer with coding examples as needed.`}
    let r = await askOllama(system, user, model, 0.7, 1024, provider, port)
    let res = await r.json()
    let answer = res.choices[0].message.content.trim()
    return {id, jobId, answer};
}

// Check if running as a script
// Continuously poll the job endpoint for new tasks
if (import.meta.url === `file://${process.argv[1]}`) {
    while(true) {
        await new Promise(r => setTimeout(r, 1000))
        console.log('Polling for jobs...')
        await processJobs(jobType,models,workerId,provider,port)
    }
}

export default { processJobs, pollJob, generateAnswer}