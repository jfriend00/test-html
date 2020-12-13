const nunjucks = require('nunjucks');
const { promisify } = require('util');
const renderString = nunjucks.renderString;
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
const outputDir = path.resolve(process.argv[3]);
const outputDirLocal = outputDir + ".local";

const inputFiles = glob.sync(inputPattern, { absolute: true });
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

const renderInput = readJSONSync("./render.json");

function replaceExtension(filename, newExt) {
    let ext = path.extname(filename);
    let newName;
    if (ext) {
        newName = filename.slice(0, -ext.length);
    } else {
        newName = filename;
    }
    newName += "." + newExt;
    return newName;
}

// nunjucks loader to allow relative path loading
function MyLoader(opts = {}) {
    // configuration
    this.opts = {};
    Object.assign(this.opts, opts);
}

MyLoader.prototype.getSource = function(name) {
    // load the template
    // return an object with:
    //   - src:     String. The template source.
    //   - path:    String. Path to template.
    //   - noCache: Bool. Don't cache the template (optional).
    let obj = {};
    obj.name = path.resolve(this.opts.base, name);
    obj.src = fs.readFileSync(obj.name).toString();
    obj.noCache = true;
    return obj;
}

const textRegex = /<text>(.*?)<\/text>/igms;

// uses negative lookahead to see if it's an entity or not
const ampRegex = /(&)(?![^\s.]+;)/igms;

function prepareEntities(str) {
    // I'm thinking that I at least need to do something about some
    // special characters like & < >, but I want to allow HTML tags
    // and legit HTML entities to already be in the text
    return str.replace(ampRegex, "&amp;")
}

function prepareHTML(str) {
    // find <text></text> and add <p></p> tags
    let newStr = str.replace(textRegex, function(match, p1) {
        // replace chars with entities
        p1 = prepareEntities(p1);
        let pieces = p1.split(/[\n\r]+/).filter(p => {
            return !!p;
        });
        return "<p>" + pieces.join("</p>\n\r\n\r<p>") + "</p>";
    });
    return newStr;
}

function modifyBaseHrefLocal(str, dir) {
    return str.replace('<base href="/test-html/">', `<base href="file:///${dir.replace(/\\/g, "/")}/">`)
}

async function run() {
    let cntr = 0;
    let errors = 0;
    let env;
    for (let file of inputFiles) {
        try {
            let base = path.basename(file);
            let dir = file.slice(0, -(base.length + 1));
            // configure nunjucks so that relative paths in templates work properly
            // use a cached environment so we aren't always making a new one
            if (!env || env._dir !== dir) {
                env = new nunjucks.Environment(new MyLoader({ base: dir }));
                env._dir = dir;
            }
            let outputFile = path.join(outputDir, base);
            console.log(`Rendering ${path.resolve(file)} => ${outputFile}`);
            let data = fs.readFileSync(file).toString();
            let renderedData = env.renderString(data, renderInput);

            // now pre-process the HTML a bit
            renderedData = prepareHTML(renderedData);

            outputFile = replaceExtension(outputFile, "html");
            fs.writeFileSync(outputFile, renderedData);

            let outputFileLocal = replaceExtension(path.join(outputDirLocal, base), "html");
            renderedData = modifyBaseHrefLocal(renderedData, outputDir);

            fs.writeFileSync(outputFileLocal, renderedData);
            ++cntr;
        } catch (e) {
            ++errors;
            console.log("\n", e, "\n");
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