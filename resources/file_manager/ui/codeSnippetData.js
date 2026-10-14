// The built-in snippets, per language. Each is [what you type, what the list shows, the body (lines; leading tabs = one indent level)].
// Body syntax is described in codeSnippets.js ($1 stops, ${1:default}, $0 = final caret position).
import { V_SNIPPETS } from "./codeSnippetV.js";

const S = (prefix, label, ...lines) => ({ prefix, label, body: lines.join("\n") });

const JS = [
  S("for", "for loop", "for (let ${1:i} = 0; $1 < ${2:items}.length; $1++) {", "\t$0", "}"),
  S("forof", "for…of loop", "for (const ${1:item} of ${2:items}) {", "\t$0", "}"),
  S("forin", "for…in loop", "for (const ${1:key} in ${2:object}) {", "\t$0", "}"),
  S("foreach", "forEach", "${1:items}.forEach((${2:item}) => {", "\t$0", "});"),
  S("while", "while loop", "while (${1:condition}) {", "\t$0", "}"),
  S("if", "if", "if (${1:condition}) {", "\t$0", "}"),
  S("ifelse", "if / else", "if (${1:condition}) {", "\t$2", "} else {", "\t$0", "}"),
  S("switch", "switch", "switch (${1:value}) {", "\tcase ${2:1}:", "\t\t$3", "\t\tbreak;", "\tdefault:", "\t\t$0", "}"),
  S("try", "try / catch", "try {", "\t$1", "} catch (${2:error}) {", "\t$0", "}"),
  S("function", "function", "function ${1:name}(${2:args}) {", "\t$0", "}"),
  S("async", "async function", "async function ${1:name}(${2:args}) {", "\t$0", "}"),
  S("arrow", "arrow function", "const ${1:name} = (${2:args}) => {", "\t$0", "};"),
  S("class", "class", "class ${1:Name} {", "\tconstructor(${2:args}) {", "\t\t$3", "\t}", "", "\t$0", "}"),
  S("import", "import", "import { ${2:name} } from \"${1:module}\";"),
  S("importd", "import default", "import ${2:name} from \"${1:module}\";"),
  S("export", "export function", "export function ${1:name}(${2:args}) {", "\t$0", "}"),
  S("exportd", "export default", "export default ${1:name};"),
  S("log", "console.log", "console.log(${1:value});"),
  S("clog", "console.log with label", "console.log(\"${1:label}:\", ${2:value});"),
  S("describe", "describe block", "describe(\"${1:name}\", () => {", "\t$0", "});"),
  S("it", "it (a test)", "it(\"${1:does something}\", () => {", "\t$0", "});"),
  S("test", "test (bun:test)", "test(\"${1:does something}\", () => {", "\texpect(${2:value}).toBe(${3:expected});", "\t$0", "});"),
  S("promise", "new Promise", "new Promise((resolve, reject) => {", "\t$0", "})"),
  S("timeout", "setTimeout", "setTimeout(() => {", "\t$0", "}, ${1:1000});"),
  S("fetch", "fetch + json", "const ${1:response} = await fetch(${2:url});", "const ${3:data} = await $1.json();"),
  S("simplegui", "SimpleGUI window (this repo)", "import { newSimpleWindow } from \"${1:../src/simplegui}\";", "", "const win = newSimpleWindow(\"${2:My App}\", ${3:640}, ${4:480});", "win.addLabel(\"${5:lbl_title}\", \"${6:Hello!}\");", "win.addButton(\"${7:btn_go}\", \"${8:Click me}\");", "win.onClick(\"$7\", () => {", "\t$0", "});", "win.run();"),
  S("newSimpleWindow", "create a SimpleGUI window", "const ${1:win} = newSimpleWindow(\"${2:My App}\", ${3:640}, ${4:480});"),
  S("addButton", "SimpleGUI button + click", "win.addButton(\"${1:btn_id}\", \"${2:Label}\");", "win.onClick(\"$1\", () => {", "\t$0", "});"),
  S("addInput", "SimpleGUI text box", "win.addInput(\"${1:txt_id}\", \"${2:}\", \"${3:Type here…}\");"),
  S("onClick", "SimpleGUI click handler", "win.onClick(\"${1:btn_id}\", () => {", "\t$0", "});"),
];

const PY = [
  S("for", "for loop", "for ${1:item} in ${2:items}:", "\t$0"),
  S("forr", "for in range", "for ${1:i} in range(${2:10}):", "\t$0"),
  S("while", "while loop", "while ${1:condition}:", "\t$0"),
  S("if", "if", "if ${1:condition}:", "\t$0"),
  S("ifelse", "if / else", "if ${1:condition}:", "\t$2", "else:", "\t$0"),
  S("def", "function", "def ${1:name}(${2:args}):", "\t${3:pass}"),
  S("class", "class", "class ${1:Name}:", "\tdef __init__(self${2:}):", "\t\t$0"),
  S("try", "try / except", "try:", "\t$1", "except ${2:Exception} as ${3:e}:", "\t$0"),
  S("with", "with open", "with open(${1:path}, ${2:\"r\"}) as ${3:f}:", "\t$0"),
  S("main", "if __name__ == \"__main__\"", "if __name__ == \"__main__\":", "\t${1:main()}"),
  S("print", "print", "print(${1:value})"),
  S("lambda", "lambda", "lambda ${1:x}: ${2:x}"),
  S("import", "import", "import ${1:module}"),
  S("from", "from … import", "from ${1:module} import ${2:name}"),
  S("listcomp", "list comprehension", "[${1:x} for ${2:x} in ${3:items}]"),
  S("test", "test function", "def test_${1:name}():", "\tassert ${2:True}"),
];

const GO = [
  S("main", "package main + main()", "package main", "", "func main() {", "\t$0", "}"),
  S("func", "function", "func ${1:name}(${2:args}) ${3:error} {", "\t$0", "}"),
  S("for", "for loop", "for ${1:i} := 0; $1 < ${2:n}; $1++ {", "\t$0", "}"),
  S("forr", "for range", "for ${1:i}, ${2:v} := range ${3:items} {", "\t$0", "}"),
  S("if", "if", "if ${1:condition} {", "\t$0", "}"),
  S("iferr", "if err != nil", "if err != nil {", "\treturn ${1:err}", "}"),
  S("switch", "switch", "switch ${1:value} {", "case ${2:1}:", "\t$3", "default:", "\t$0", "}"),
  S("struct", "struct", "type ${1:Name} struct {", "\t${2:Field} ${3:string}", "}"),
  S("interface", "interface", "type ${1:Name} interface {", "\t${2:Method}() ${3:error}", "}"),
  S("go", "goroutine", "go func() {", "\t$0", "}()"),
  S("select", "select", "select {", "case ${1:v} := <-${2:ch}:", "\t$0", "}"),
  S("test", "test function", "func Test${1:Name}(t *testing.T) {", "\t$0", "}"),
  S("println", "fmt.Println", "fmt.Println(${1:value})"),
];

const RUST = [
  S("fn", "function", "fn ${1:name}(${2:args}) ${3:-> i32 }{", "\t$0", "}"),
  S("main", "fn main", "fn main() {", "\t$0", "}"),
  S("struct", "struct", "struct ${1:Name} {", "\t${2:field}: ${3:String},", "}"),
  S("impl", "impl block", "impl ${1:Name} {", "\tfn ${2:new}() -> Self {", "\t\t$0", "\t}", "}"),
  S("enum", "enum", "enum ${1:Name} {", "\t${2:Variant},", "}"),
  S("trait", "trait", "trait ${1:Name} {", "\tfn ${2:method}(&self);", "}"),
  S("match", "match", "match ${1:value} {", "\t${2:pattern} => $3,", "\t_ => $0,", "}"),
  S("for", "for loop", "for ${1:item} in ${2:items} {", "\t$0", "}"),
  S("while", "while loop", "while ${1:condition} {", "\t$0", "}"),
  S("iflet", "if let", "if let ${1:Some(x)} = ${2:value} {", "\t$0", "}"),
  S("test", "test function", "#[test]", "fn ${1:name}() {", "\tassert_eq!(${2:1}, ${3:1});", "}"),
  S("println", "println!", "println!(\"${1:{\\}}\", ${2:value});"),
];

const JAVA = [
  S("main", "main method", "public static void main(String[] args) {", "\t$0", "}"),
  S("class", "class", "public class ${1:Name} {", "\t$0", "}"),
  S("for", "for loop", "for (int ${1:i} = 0; $1 < ${2:n}; $1++) {", "\t$0", "}"),
  S("foreach", "for each", "for (${1:String} ${2:item} : ${3:items}) {", "\t$0", "}"),
  S("if", "if", "if (${1:condition}) {", "\t$0", "}"),
  S("try", "try / catch", "try {", "\t$1", "} catch (${2:Exception} ${3:e}) {", "\t$0", "}"),
  S("sout", "System.out.println", "System.out.println(${1:value});"),
  S("interface", "interface", "public interface ${1:Name} {", "\t$0", "}"),
  S("enum", "enum", "public enum ${1:Name} {", "\t${2:A}, ${3:B}", "}"),
];

const C_LIKE = [
  S("main", "main function", "int main(${1:void}) {", "\t$0", "\treturn 0;", "}"),
  S("for", "for loop", "for (int ${1:i} = 0; $1 < ${2:n}; $1++) {", "\t$0", "}"),
  S("while", "while loop", "while (${1:condition}) {", "\t$0", "}"),
  S("if", "if", "if (${1:condition}) {", "\t$0", "}"),
  S("switch", "switch", "switch (${1:value}) {", "case ${2:1}:", "\t$3", "\tbreak;", "default:", "\t$0", "}"),
  S("struct", "struct", "struct ${1:Name} {", "\t$0", "};"),
  S("enum", "enum", "enum ${1:Name} {", "\t${2:A},", "};"),
  S("printf", "printf", "printf(\"${1:%d}\\n\", ${2:value});"),
  S("include", "#include", "#include <${1:stdio.h}>"),
];

const CPP_EXTRA = [
  S("class", "class", "class ${1:Name} {", "public:", "\t$1(${2:});", "\t$0", "};"),
  S("cout", "std::cout", "std::cout << ${1:value} << std::endl;"),
  S("vector", "std::vector", "std::vector<${1:int}> ${2:items};"),
  S("namespace", "namespace", "namespace ${1:name} {", "$0", "}"),
  S("lambda", "lambda", "[${1:&}](${2:int x}) {", "\t$0", "}"),
];

const CSHARP = [
  S("main", "Main method", "static void Main(string[] args)", "{", "\t$0", "}"),
  S("class", "class", "public class ${1:Name}", "{", "\t$0", "}"),
  S("for", "for loop", "for (int ${1:i} = 0; $1 < ${2:n}; $1++)", "{", "\t$0", "}"),
  S("foreach", "foreach", "foreach (var ${1:item} in ${2:items})", "{", "\t$0", "}"),
  S("if", "if", "if (${1:condition})", "{", "\t$0", "}"),
  S("prop", "property", "public ${1:string} ${2:Name} { get; set; }"),
  S("cw", "Console.WriteLine", "Console.WriteLine(${1:value});"),
  S("try", "try / catch", "try", "{", "\t$1", "}", "catch (${2:Exception} ${3:e})", "{", "\t$0", "}"),
];

const PHP = [
  S("php", "<?php", "<?php", "", "$0"),
  S("function", "function", "function ${1:name}(${2:\\$args}) {", "\t$0", "}"),
  S("class", "class", "class ${1:Name}", "{", "\t$0", "}"),
  S("foreach", "foreach", "foreach (${1:\\$items} as ${2:\\$item}) {", "\t$0", "}"),
  S("for", "for loop", "for (\\$${1:i} = 0; \\$$1 < ${2:10}; \\$$1++) {", "\t$0", "}"),
  S("if", "if", "if (${1:condition}) {", "\t$0", "}"),
  S("echo", "echo", "echo ${1:\"value\"};"),
];

const RUBY = [
  S("def", "method", "def ${1:name}(${2:args})", "\t$0", "end"),
  S("class", "class", "class ${1:Name}", "\tdef initialize(${2:args})", "\t\t$0", "\tend", "end"),
  S("each", "each", "${1:items}.each do |${2:item}|", "\t$0", "end"),
  S("if", "if", "if ${1:condition}", "\t$0", "end"),
  S("puts", "puts", "puts ${1:value}"),
  S("begin", "begin / rescue", "begin", "\t$1", "rescue ${2:StandardError} => ${3:e}", "\t$0", "end"),
];

const SWIFT = [
  S("func", "function", "func ${1:name}(${2:_ x: Int}) -> ${3:Int} {", "\t$0", "}"),
  S("struct", "struct", "struct ${1:Name} {", "\t$0", "}"),
  S("class", "class", "class ${1:Name} {", "\t$0", "}"),
  S("for", "for loop", "for ${1:item} in ${2:items} {", "\t$0", "}"),
  S("iflet", "if let", "if let ${1:x} = ${2:value} {", "\t$0", "}"),
  S("guard", "guard", "guard let ${1:x} = ${2:value} else {", "\t$0", "}"),
  S("print", "print", "print(${1:value})"),
];

const KOTLIN = [
  S("main", "fun main", "fun main() {", "\t$0", "}"),
  S("fun", "function", "fun ${1:name}(${2:x: Int}): ${3:Int} {", "\t$0", "}"),
  S("class", "class", "class ${1:Name}(${2:val x: Int}) {", "\t$0", "}"),
  S("data", "data class", "data class ${1:Name}(val ${2:x}: ${3:Int})"),
  S("when", "when", "when (${1:value}) {", "\t${2:1} -> $3", "\telse -> $0", "}"),
  S("for", "for loop", "for (${1:item} in ${2:items}) {", "\t$0", "}"),
  S("println", "println", "println(${1:value})"),
];

const SHELL = [
  S("shebang", "#!/usr/bin/env bash", "#!/usr/bin/env bash", "set -euo pipefail", "", "$0"),
  S("if", "if", "if [[ ${1:condition} ]]; then", "\t$0", "fi"),
  S("for", "for loop", "for ${1:item} in ${2:items}; do", "\t$0", "done"),
  S("while", "while loop", "while ${1:condition}; do", "\t$0", "done"),
  S("case", "case", "case \"\\$${1:var}\" in", "\t${2:a})", "\t\t$3", "\t\t;;", "\t*)", "\t\t$0", "\t\t;;", "esac"),
  S("function", "function", "${1:name}() {", "\t$0", "}"),
];

const SQL = [
  S("select", "SELECT", "SELECT ${1:*}", "FROM ${2:table}", "WHERE ${3:condition};"),
  S("insert", "INSERT", "INSERT INTO ${1:table} (${2:columns})", "VALUES (${3:values});"),
  S("update", "UPDATE", "UPDATE ${1:table}", "SET ${2:column} = ${3:value}", "WHERE ${4:condition};"),
  S("delete", "DELETE", "DELETE FROM ${1:table}", "WHERE ${2:condition};"),
  S("create", "CREATE TABLE", "CREATE TABLE ${1:name} (", "\tid INTEGER PRIMARY KEY,", "\t${2:column} ${3:TEXT}", ");"),
  S("join", "JOIN", "JOIN ${1:table} ON ${2:a.id} = ${3:b.id}"),
];

const HTML = [
  S("!", "HTML5 page", "<!DOCTYPE html>", "<html lang=\"${1:en}\">", "<head>", "\t<meta charset=\"UTF-8\">", "\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">", "\t<title>${2:Document}</title>", "</head>", "<body>", "\t$0", "</body>", "</html>"),
  S("html5", "HTML5 page", "<!DOCTYPE html>", "<html lang=\"${1:en}\">", "<head>", "\t<meta charset=\"UTF-8\">", "\t<title>${2:Document}</title>", "</head>", "<body>", "\t$0", "</body>", "</html>"),
  S("div", "div", "<div class=\"${1:name}\">", "\t$0", "</div>"),
  S("a", "link", "<a href=\"${1:#}\">${2:text}</a>"),
  S("img", "image", "<img src=\"${1:path}\" alt=\"${2:description}\">"),
  S("ul", "list", "<ul>", "\t<li>${1:item}</li>", "\t$0", "</ul>"),
  S("table", "table", "<table>", "\t<tr>", "\t\t<th>${1:Heading}</th>", "\t</tr>", "\t<tr>", "\t\t<td>${2:Cell}</td>", "\t</tr>", "</table>"),
  S("form", "form", "<form action=\"${1:}\" method=\"${2:post}\">", "\t$0", "</form>"),
  S("input", "input", "<input type=\"${1:text}\" name=\"${2:name}\">"),
  S("button", "button", "<button type=\"button\">${1:Click me}</button>"),
  S("script", "script", "<script src=\"${1:app.js}\"></script>"),
  S("link", "stylesheet link", "<link rel=\"stylesheet\" href=\"${1:style.css}\">"),
];

const CSS = [
  S("flex", "flex centre", "display: flex;", "align-items: center;", "justify-content: center;"),
  S("grid", "grid", "display: grid;", "grid-template-columns: repeat(${1:3}, 1fr);", "gap: ${2:1rem};"),
  S("media", "media query", "@media (max-width: ${1:600px}) {", "\t$0", "}"),
  S("keyframes", "keyframes", "@keyframes ${1:name} {", "\tfrom { $2 }", "\tto { $0 }", "}"),
  S("root", ":root variables", ":root {", "\t--${1:name}: ${2:#333};", "}"),
  S("var", "var()", "var(--${1:name})"),
];

const MARKDOWN = [
  S("link", "link", "[${1:text}](${2:https://})"),
  S("image", "image", "![${1:description}](${2:path})"),
  S("code", "code block", "```${1:js}", "$0", "```"),
  S("table", "table", "| ${1:A} | ${2:B} |", "| --- | --- |", "| $3 | $0 |"),
  S("todo", "task list", "- [ ] ${1:task}"),
];

export const SNIPPETS = {
  "javascript": JS, "typescript": JS, python: PY, go: GO, rust: RUST, java: JAVA, kotlin: KOTLIN, c: C_LIKE, cpp: [...C_LIKE, ...CPP_EXTRA], csharp: CSHARP, php: PHP, ruby: RUBY, swift: SWIFT,
  shell: SHELL, sql: SQL, html: HTML, css: CSS, markdown: MARKDOWN, v: V_SNIPPETS,
};
