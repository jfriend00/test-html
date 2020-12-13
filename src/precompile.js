const nunjucks = require('nunjucks');
const { promisify } = require('util');
const renderString = promisify(nunjucks.renderString);
const glob = require('glob');
const fs = require('fs');
const path = require('path');


if (process.argv.length < 4) {
    console.log(
        `\nUsage: node precompile inputPattern outputDir
  Passes data from render.json to each template when rendering
`);
    process.exit(1);
}

const inputPattern = process.argv[2];
const outputDir = process.argv[3];

const inputFiles = glob.sync(inputPattern);
console.log(inputFiles);
if (inputFiles.length === 0) {
    console.log(`No files match input pattern ${inputPattern}`);
    process.exit(2);
}

let stats;
try {
    stats = fs.statSync(outputDir, { throwIfNoEntry: false });
} catch (e) {
    if (e.code !== 'ENOENT') {
        throw e;
    }
}
if (!stats) {
    console.log(`outputDir ${outputDir} not found.`);
    process.exit(3);
}
if (!stats.isDirectory()) {
    console.log(`outputDir ${outputDir} not a directory`);
    process.exit(4);
}

function readJSONSync(filename) {
    let data;
    try {
        data = fs.readFileSync(filename).toString();
        data = JSON.parse(data);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
        data = {};
    }
    return data;
}

const renderData = readJSONSync("./render.json");

async function run() {
    let cntr = 0;
    let errors = 0;
    for (let file of inputFiles) {
        try {
            let base = path.basename(file);
            let data = fs.readFileSync(file).toString();
            let renderedData = await renderString(data, renderData);
            let outputFile = path.join(outputDir, base);
            fs.writeFileSync(outputFile, renderedData);
            console.log(`Rendering ${file} => ${outputFile}`);
            ++cntr;
        } catch (e) {
            ++errors;
            console.log(`Can't render ${outputFile}`);
            console.log(e);
        }
    }
    if (!errors) {
        return `${cntr} files rendered`
    } else {
        return `${cntr} files rendered and ${errors} files not rendered because of error`;
    }
}

run().then(result => {
    console.log(result);
}).catch(err => {
    console.log(err);
});

/*
nunjucks.renderString("My name is: {{name}}", { name: "John" }, (err, res) => {
    if (err) {
        console.log(err);
    } else {
        console.log(res);
    }
});
*/