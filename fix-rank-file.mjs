#!/usr/bin/env node

import fs from "fs"
import path from "path"
import {useClient, useLogging, idParts, lastLeftPart, lastRightPart, openAiResponse}  from "./lib.mjs"

const { logInfo, logDebug, logError } = useLogging()

const file = process.argv[2] // Validation file
let modelName = process.argv[3]
let port = process.argv[4]

const { openAi } = useClient()
const maxTokens = 4096
const temperature = 0.1

let systemPrompt = { "role":"system", "content":"You are an AI assistant helping with tasks of structuring unstructured text into JSON format." }

let expectedReasonsSchema = {
    "<answer-letter>": {
        "score": {
            "type": "integer"
        },
        "critique": {
            "type": "string"
        }
    }
}


async function fixRankFile(filePath, modelName, userId) {
    try {
        //logInfo(`Starting process...`)
        // Read the validation file
        const data = fs.readFileSync(filePath, 'utf8');
        const validationJsonData = JSON.parse(data);

        // Extract the question ID from the file name
        const id = path.basename(filePath).split('.')[0];

        // Check if the reasons file already exists
        const reasonsFile = filePath.replace('.validation.', '.reasons.');
        if (fs.existsSync(reasonsFile)) {
            return;
        }

        // Extract the original response from the validation file
        const contentExists = validationJsonData.response != null && validationJsonData.response.choices != null && validationJsonData.response.choices.length > 0 &&
            validationJsonData.response.choices[0].message != null && validationJsonData.response.choices[0].message.content != null &&
            validationJsonData.response.choices[0].message.role === 'assistant';

        const validationDataHasModelMap = validationJsonData.modelMap != null && Object.keys(validationJsonData.modelMap).length > 0;
        // If the content exists, prompt for the extraction of the critique
        if (contentExists && validationDataHasModelMap) {
            logInfo(`Content found in validation file: ${filePath}`)
            let structuredReasons = await promptForJustificationExtraction(validationJsonData.response.choices[0].message.content);
            // Map reasons back to "modelName": "reason" format
            const isValid = structuredReasons != null && Object.keys(structuredReasons).length > 0 &&
                Object.keys(structuredReasons).every(key => key.length === 1 && key.match(/[A-Z]/) != null &&
                    structuredReasons[key].hasOwnProperty('score') && structuredReasons[key].hasOwnProperty('critique'));
            if (!isValid) {
                logError(`Invalid structured reasons found in validation file: ${filePath}`);
                return;
            }
            let modelReasons = {};
            Object.keys(structuredReasons).forEach(key => {
                // Check if validationJsonData modelMap has the key
                if (!validationJsonData.modelMap.hasOwnProperty(key)) {
                    logError(`Model map key not found: ${key}`);
                    return;
                }
                modelReasons[validationJsonData.modelMap[key]] = structuredReasons[key];
            });
            // Check if valid json
            if (Object.keys(modelReasons).length > 0) {
                // Write the structured reasons to the reasons file
                fs.writeFileSync(reasonsFile, JSON.stringify(modelReasons, null, 4));
                logInfo(`Reasons file written: ${reasonsFile}`);
            } else {
                logError(`No structured reasons found in validation file: ${filePath}`);
            }
        } else {
            logError(`Expected content not found in validation file: ${filePath}`);
            logDebug(`Validation file data: ${JSON.stringify(validationJsonData, null,4)}`);
            return;
        }

        // Check if the votes file already exists
        // Extract model name from file name
        let fileModelName = path.basename(filePath).split('.')[2];
        const votesFile = filePath.replace(`.validation.${fileModelName}.json`, '.v.json');
        // If the votes file already exists, read the JSON and count the modelVotes keys
        if (fs.existsSync(votesFile)) {
            const data = fs.readFileSync(votesFile, 'utf8');
            const votesJsonData = JSON.parse(data);
            logInfo(`Votes file already exists: ${votesFile}`);
            //logDebug(`Votes file data: ${JSON.stringify(votesJsonData)}`);

            // Find matching answer files for id
            const answerFiles = fs.readdirSync(path.dirname(filePath)).filter(file => file.startsWith(id) && file.indexOf(`.a.`) > -1);
            let humanAnswerFiles = fs.readdirSync(path.dirname(filePath)).filter(file => file.startsWith(id) && file.indexOf(`.h.`) > -1);

            // Get the total answers that we should have votes for
            const allAnswerFiles = answerFiles.concat(humanAnswerFiles);
            let totalAnswers = allAnswerFiles.length;
            let answerModelNames = allAnswerFiles.map(file => file.split('.')[2]);

            // Check if the votes file already has enough votes
            if (Object.keys(votesJsonData.modelVotes).length >= totalAnswers) {
                logInfo(`Votes file already has enough votes: ${votesFile}`);
                return;
            }

            let structuredAnswers = promptForVoteExtraction(validationJsonData.response.choices[0].message.content);
            // Map reasons back to "modelName": "reason" format
            let modelVotes = {};
            Object.keys(structuredAnswers).forEach(key => {
                modelVotes[validationJsonData.modelMap[key]] = structuredAnswers[key];
            });
            // Check if valid json
            if (Object.keys(modelVotes).length > 0) {
                // Write the structured answers to the votes file
                fs.writeFileSync(votesFile, JSON.stringify(modelVotes, null, 4));
                logInfo(`Votes file written: ${votesFile}`);
            } else {
                logError(`No structured answers found in validation file: ${filePath}`);
            }

            // Check if all the models are present in the votes file
            let missingModels = answerModelNames.filter(model => !votesJsonData.modelVotes.hasOwnProperty(model));
            if (missingModels.length > 0) {
                logError(`Missing votes for models: ${missingModels.join(', ')}`);
            }
        }
    } catch (error) {
        console.log(`Error processing file: ${filePath}`, error)
        logError(`Error processing file: ${filePath}`, error);
    }
}

async function promptForJustificationExtraction(validationContent) {
    let prompt = `I need you to extract each critique from the following text: 
    
    ---
    ${validationContent}
    ---
    
    Copy the content into a JSON structure where the key is the answer letter, eg "A", and the value is the critique is the value.

Here is the JSON Schema I am expecting for the structured critiques:

    ${JSON.stringify(expectedReasonsSchema,null,4)}
    
    The above is the JSON schema, your output must adhere to it. Use the text above about each answer to populate that structure and return it.`

    let r = null
    try {
        // logDebug(`=== REQUEST ${id} ===`)
        // logDebug(`${id}, ${questionPath}`)
        // logDebug(`=== END REQUEST ${id} ===\n\n`)

        r = await openAi({ content: prompt, model: modelName, port, systemPrompt, temperature, maxTokens })
    } catch (e) {
        console.log(e)
        logError(`Failed:`, e)
        process.exit()
    }
    // logDebug(`=== RESPONSE ${id} ===`)
    const resJson = await r.text()

// Check if resJson is empty
    logDebug('RESPONSE JSON LENGTH: ' + resJson.length)

    logDebug('=== PARSING RESPONSE ===')
    const res = openAiResponse(resJson, modelName)
    logDebug('=== END PARSING RESPONSE ===\n\n')

    const responseContent = res?.choices?.length > 0 && res.choices[0].message?.content

    logDebug('=== RESPONSE CONTENT ===')
    logDebug(responseContent)
    logDebug('=== END RESPONSE CONTENT ===\n\n')

    // Extract the JSON from the text using regex
    let structuredReasons = responseContent.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
    if (structuredReasons == null || structuredReasons.length === 0) {
        logError(`No structured reasons found in response: ${responseContent}`);
        return {};
    }
    return JSON.parse(structuredReasons[0]);
}

async function promptForVoteExtraction(validationContent) {
    let prompt = `I need you to extract the votes from the following text: ${validationContent}
    Copy the content into a JSON structure where the key is the answer letter, eg "A", and the value is the vote.
    Do this for each answer in the text and return all votes in a single JSON object.`
    let r = null;
    try {
        r = await openAi({ content: prompt, model: modelName, port, systemPrompt, temperature, maxTokens })
    } catch (e) {
        console.log(e)
        logError(`Failed:`, e)
        process.exit()
    }
    const resJson = await r.text()
    const res = openAiResponse(resJson, modelName)
    const responseContent = res?.choices?.length > 0 && res.choices[0].message?.content
    // Extract the JSON from the text using regex
    let structuredVotes = responseContent.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
    if (structuredVotes == null || structuredVotes.length === 0) {
        logError(`No structured votes found in response: ${responseContent}`);
        return {};
    }
    return structuredVotes;
}

await fixRankFile(file, modelName, port)
process.exit(0)

