/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const vscode_languageserver_1 = require("vscode-languageserver");
const parser = require("./parser");
const advisor_1 = require("./advisor");
// Create a connection for the server. The connection uses Node's IPC as a transport
let connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents = new vscode_languageserver_1.TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot;
connection.onInitialize((params) => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['', '.']
            }
            // ,hoverProvider : true
        }
    };
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});
// hold the maxNumberOfProblems setting
let maxNumberOfProblems;
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
    let settings = change.settings;
    maxNumberOfProblems = settings.settings.maxNumberOfProblems || 100;
    // Revalidate any open text documents
    documents.all().forEach(validateTextDocument);
});
function validateTextDocument(textDocument) {
    let diagnostics = [];
    let lines = textDocument.getText().split(/\r?\n/g);
    let problems = 0;
    for (var i = 0; i < lines.length && problems < maxNumberOfProblems; i++) {
        let line = lines[i];
        let index = line.indexOf('typescript');
        if (index >= 0) {
            problems++;
            diagnostics.push({
                severity: vscode_languageserver_1.DiagnosticSeverity.Warning,
                range: {
                    start: { line: i, character: index },
                    end: { line: i, character: index + 10 }
                },
                message: `${line.substr(index, 10)} should be spelled TypeScript`,
                source: 'ex'
            });
        }
    }
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
connection.onDidChangeWatchedFiles((_change) => {
    // Monitored files have change in VSCode
    connection.console.log('We recevied an file change event');
});
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition) => {
    console.log();
    let textDocument = documents.get(_textDocumentPosition.textDocument.uri);
    var fileName = path.basename(_textDocumentPosition.textDocument.uri);
    let pos = textDocument.offsetAt(_textDocumentPosition.position);
    let doc = textDocument.getText();
    let lines = doc.split(/\r?\n/g);
    let line = lines[_textDocumentPosition.position.line];
    // Get current closure and parse its method
    let closure = parser.getCurrentClosure(doc, pos);
    let method = parser.parseClosureMethod(closure.methodStr);
    // On ROOT, handle TaskContainer creation paramters
    if (method.method == "") {
        let curMethod = parser.parseClosureMethod(line);
        if (curMethod.method == "task") {
            console.log("=== Keywords for Task constructor ===");
            // Return Task types if after "type: "
            if (line.substring(0, _textDocumentPosition.position.character - 1).trim().endsWith("type:"))
                return advisor_1.getTaskTypes();
            // Return Task creation option keywords after '(' or ','
            if (parser.shouldHintParam(line, _textDocumentPosition.position.character))
                return advisor_1.getTaskCreationOptions();
            // Return nothing by default
            return [];
        }
    }
    // Collect plugins used for root closure
    let pluginConf = {};
    for (var i = 0; i < lines.length; i++) {
        let line = lines[i];
        // Prune 'apply\s*plugin\s*:\s*'
        let applyIdx = line.indexOf('apply');
        if (applyIdx < 0)
            continue;
        line = line.substring(applyIdx + 6);
        let pluginIdx = line.indexOf('plugin');
        if (pluginIdx < 0)
            continue;
        line = line.substring(pluginIdx + 6);
        let colonIdx = line.indexOf(':');
        if (colonIdx < 0)
            continue;
        // Confirm plugin type
        if (line.indexOf('java') >= 0)
            pluginConf['java'] = true;
        if (line.indexOf('java-library') >= 0)
            pluginConf['java-library'] = true;
        if (line.indexOf('com.android.application') >= 0)
            pluginConf['com.android.application'] = true;
    }
    // Return completion items
    console.log("=== Keywords for current closure ===");
    if (method.method == undefined)
        return [];
    let retval = [];
    if (method.method == "") {
        retval = advisor_1.getRootKeywords(fileName, pluginConf);
    }
    else {
        retval = advisor_1.getKeywords(method.method, pluginConf);
    }
    if (retval.length != 0) {
        return retval;
    }
    // If method not in mapping, try parent closure's method 
    console.log("=== Try parent closure ===");
    let parentClosure = parser.getCurrentClosure(doc, closure.methodStartPos);
    let parentMethod = parser.parseClosureMethod(parentClosure.methodStr);
    console.log();
    if (parentMethod.method == undefined)
        return [];
    if (parentMethod.method != "") {
        retval = advisor_1.getNestedKeywords(parentMethod.method, pluginConf);
    }
    if (retval.length > 0)
        return retval;
    else
        return [];
});
// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    if (item.data === 1) {
        item.detail = 'TypeScript details',
            item.documentation = 'TypeScript documentation';
    }
    else if (item.data === 2) {
        item.detail = 'JavaScript details',
            item.documentation = 'JavaScript documentation';
    }
    return item;
});
/*
connection.onDidOpenTextDocument((params) => {
    // A text document got opened in VSCode.
    // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.text the initial full content of the document.
    connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
    // The content of a text document did change in VSCode.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
    // A text document got closed in VSCode.
    // params.uri uniquely identifies the document.
    connection.console.log(`${params.textDocument.uri} closed.`);
});
*/
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map