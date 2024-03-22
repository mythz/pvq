import fs from "fs"
import path from "path"

function readDotEnv() {
    // Read the .env file
    const envFile = path.join('./', '.env');
    const envData = fs.readFileSync(envFile, { encoding: 'utf-8' });

    // Parse the environment variables
    const envLines = envData.split('\n');
    for (const line of envLines) {
        const [key, value] = line.trim().split('=');
        if (key && value) {
            process.env[key] = value;
        }
    }
}

export default readDotEnv;