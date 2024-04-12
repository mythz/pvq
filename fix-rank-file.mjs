#!/usr/bin/env node

import fs from "fs"
import path from "path"
import {useClient, useLogging, idParts, lastLeftPart, lastRightPart, openAiResponse}  from "./lib.mjs"

const { logInfo, logDebug, logError } = useLogging()

const file = process.argv[2] // Validation file
let modelName = process.argv[3]
let port = process.argv[4]

const { openAi } = useClient()
const maxTokens = 2048
const temperature = 0.1

let systemPrompt = { "role":"system", "content":"You are an AI assistant helping with tasks of structuring unstructured text into JSON format." }

let expectedReasonsSchema = {
    "<answer-letter>": {
        "score": {
            "type": "integer"
        },
        "reason": {
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
        // If the content exists, prompt for the extraction of the reason
        if (contentExists && validationDataHasModelMap) {
            logInfo(`Content found in validation file: ${filePath}`)
            let structuredReasons = await promptForJustificationExtraction(validationJsonData.response.choices[0].message.content,filePath);
            // Map reasons back to "modelName": "reason" format
            const isValid = structuredReasons != null && Object.keys(structuredReasons).length > 0 &&
                Object.keys(structuredReasons).every(key => key.length === 1 && key.match(/[A-Z]/) != null &&
                    structuredReasons[key].hasOwnProperty('score') && structuredReasons[key].hasOwnProperty('reason'));
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

            // Check if all the models are present in the votes file
            let missingModels = answerModelNames.filter(model => !votesJsonData.modelVotes.hasOwnProperty(model));
            if (missingModels.length > 0) {
                logError(`Missing votes for models: ${missingModels.join(', ')}`);
            }
            // TODO - Prompt for missing votes answer by answer
        }
    } catch (error) {
        console.log(`Error processing file: ${filePath}`, error)
        logError(`Error processing file: ${filePath}`, error);
    }
}

async function promptForJustificationExtraction(validationContent, validationFilePath) {
    let prompt = `I need you to extract each reason for the score from the following text: 
    
    ---
    ${validationContent}
    ---
    
    Copy the content into a JSON structure where the key is the answer letter, eg "A", and the value is the reason is the value.
    Make sure to escape any double quotes in the reason with a backslash, eg "This is a \\"reason\\"". As well as any black slashes in the original content.
    Only use letters as keys, if source material uses numbers, pick the first when transcribing into JSON. Eg. "F1" -> "F". 
    Multiple solutions should be ignored, pick one so that your JSON matches the schema.

Here is the JSON Schema I am expecting for the structured reasons:

    ${JSON.stringify(expectedReasonsSchema,null,4)}
    
    The above is the JSON schema, your output must adhere to it. Use the text above about each answer to populate that structure and return it.`

    const id = `${lastRightPart(lastLeftPart(file, '.'), '/')}`.padStart(3, '0')
    let startTime = performance.now()
    let r = null
    let resJson = null
    try {
        logDebug(`=== REQUEST ${id} ===`)
        logDebug(`${id}, ${validationFilePath}`)
        logDebug(`=== END REQUEST ${id} ===\n\n`)

        r = await openAi({content: prompt, model: modelName, port, systemPrompt, temperature, maxTokens})

        logDebug(`=== RESPONSE ${id} ===`)
        resJson = await r.text()

        let endTime = performance.now()
        let elapsed_ms = parseInt(endTime - startTime)

        logDebug(`=== RESPONSE ${id} in ${elapsed_ms}ms ===\n`)

        // Check if resJson is empty
        logDebug('RESPONSE JSON LENGTH: ' + resJson.length)

        const res = openAiResponse(resJson, modelName)

        const responseContent = res?.choices?.length > 0 && res.choices[0].message?.content

        // Extract the JSON from the text using regex
        let structuredReasons = responseContent.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
        if (structuredReasons == null || structuredReasons.length === 0) {
            logError(`No structured reasons found in response: ${responseContent}`);
            return {};
        }
        // Replace any escaped backslashes not before a double quote
        const correctedJson = structuredReasons[0].replace(/\\(?!")/g, '\\\\').replace("\"\"","\\\"\\\"")
        logDebug('=== STRUCTURED REASONS ===')
        logDebug(structuredReasons[0])
        logDebug('=== END STRUCTURED REASONS ===\n\n')
        logDebug('=== CORRECTED JSON ===')
        logDebug(correctedJson)
        logDebug('=== END CORRECTED JSON ===\n\n')

        return JSON.parse(correctedJson);
    } catch (e) {
        logError(`Failed:`, e.message);
        logDebug(`Stack: ${e.stack}`);
        // Write error file based on validationFilePath
        let errorFilePath = validationFilePath.replace('.validation.', '.fix-rank.e.');
        fs.writeFileSync(errorFilePath, JSON.stringify({error: e.message, stack: e.stack, response: resJson}), 'UTF-8');
        process.exit();
    }
}

await fixRankFile(file, modelName, port)
process.exit(0)

