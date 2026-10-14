// The word lists behind code completion: built-in names and members for each language. Plain data, written as
// space-separated names; a name followed by (params) is a function or method, and the params (separated by commas,
// no spaces) are shown as hints. Nothing here runs or reads anything: it is all just text.
import { SPECS } from "./codeSpecs.js";
import { V_GLOBALS, V_RECEIVERS, V_TYPES } from "./codeCompleteV.js";

const split = (s) => (s ? s.split(" ").filter(Boolean) : []);

/** The languages that share a vocabulary (open tabs of the same family feed each other's completions). */
const FAMILY = { "javascript": "js", "typescript": "js", c: "c", cpp: "c", java: "jvm", kotlin: "jvm", csharp: "jvm", html: "web", css: "css", xml: "web" };
export const familyOf = (lang) => FAMILY[lang] ?? lang;

const JS_GLOBALS = "console Math JSON Object Array String Number Boolean Promise Date Map Set WeakMap WeakSet RegExp Error TypeError RangeError Symbol BigInt URL URLSearchParams Intl globalThis window document process Bun require module exports parseInt(string,radix) parseFloat(string) isNaN(value) isFinite(value) setTimeout(handler,ms) setInterval(handler,ms) clearTimeout(id) clearInterval(id) fetch(url,options) structuredClone(value) queueMicrotask(callback) encodeURIComponent(text) decodeURIComponent(text) alert(message) atob(data) btoa(data) createWindow(title,width,height,options) newSimpleWindow(title,width,height,options)";

const STRING_JS = "length at(index) charAt(index) charCodeAt(index) codePointAt(index) concat(...strings) endsWith(search) includes(search) indexOf(search) lastIndexOf(search) localeCompare(that) match(regexp) matchAll(regexp) normalize(form) padEnd(length,fill) padStart(length,fill) repeat(count) replace(search,replacement) replaceAll(search,replacement) search(regexp) slice(start,end) split(separator,limit) startsWith(search) substring(start,end) toLowerCase() toUpperCase() toString() trim() trimEnd() trimStart() valueOf()";
const ARRAY_JS = "length at(index) concat(...items) copyWithin(target,start,end) entries() every(predicate) fill(value,start,end) filter(predicate) find(predicate) findIndex(predicate) findLast(predicate) findLastIndex(predicate) flat(depth) flatMap(callback) forEach(callback) includes(value) indexOf(value) join(separator) keys() lastIndexOf(value) map(callback) pop() push(...items) reduce(callback,initial) reduceRight(callback,initial) reverse() shift() slice(start,end) some(predicate) sort(compare) splice(start,deleteCount,...items) toReversed() toSorted(compare) toSpliced(start,deleteCount,...items) unshift(...items) values() with(index,value)";
const OBJECT_JS = "keys(obj) values(obj) entries(obj) assign(target,...sources) freeze(obj) isFrozen(obj) seal(obj) fromEntries(entries) getPrototypeOf(obj) setPrototypeOf(obj,proto) create(proto) defineProperty(obj,key,descriptor) defineProperties(obj,props) getOwnPropertyNames(obj) getOwnPropertyDescriptor(obj,key) hasOwn(obj,key) is(a,b) groupBy(items,callback)";
const NUMBER_JS = "toFixed(digits) toPrecision(precision) toString(radix) toLocaleString(locales) valueOf()";
const PROMISE_JS = "then(onFulfilled,onRejected) catch(onRejected) finally(onFinally)";
const PROMISE_STATIC_JS = "all(promises) allSettled(promises) any(promises) race(promises) resolve(value) reject(reason) withResolvers()";
const MAP_JS = "size clear() delete(key) entries() forEach(callback) get(key) has(key) keys() set(key,value) values()";
const SET_JS = "size add(value) clear() delete(value) entries() forEach(callback) has(value) keys() values()";
const DATE_JS = "getDate() getDay() getFullYear() getHours() getMilliseconds() getMinutes() getMonth() getSeconds() getTime() getTimezoneOffset() setDate(day) setFullYear(year) setHours(hours) setMinutes(minutes) setMonth(month) setSeconds(seconds) setTime(ms) toISOString() toJSON() toLocaleDateString(locales) toLocaleString(locales) toLocaleTimeString(locales) toString() valueOf()";
const DATE_STATIC_JS = "now() parse(text) UTC(year,month)";
const WIN_GUI = "addLabel(id,text) addButton(id,text) addInput(id,value,placeholder) addTextArea(id,value) addCheckbox(id,label,checked) addDropdown(id,items,selected) addTable(id,headers,rows) addProgressBar(value,max) onClick(id,callback) onChange(id,callback) beginRow() endRow() getText(id) setText(id,text) getValue(id) setValue(id,value) info(title,message) alert(message,title) setTheme(name) show() run() close()";

const JS_TYPES = {
  string: STRING_JS, array: ARRAY_JS, number: NUMBER_JS, promise: PROMISE_JS, map: MAP_JS, set: SET_JS, date: DATE_JS, win: WIN_GUI,
  regexp: "exec(text) test(text) source flags global lastIndex",
  console: "log(...data) error(...data) warn(...data) info(...data) debug(...data) table(data) dir(obj) time(label) timeEnd(label) group(label) groupEnd() assert(condition,...data) trace() clear() count(label)",
  Math: "PI E abs(x) ceil(x) floor(x) round(x) trunc(x) sign(x) sqrt(x) cbrt(x) pow(x,y) exp(x) log(x) log2(x) log10(x) max(...values) min(...values) random() sin(x) cos(x) tan(x) atan(x) atan2(y,x) hypot(...values) clamp(x,min,max)",
  JSON: "parse(text,reviver) stringify(value,replacer,space)",
  Object: OBJECT_JS, Array: "isArray(value) from(items,mapFn) of(...items)", Number: "isInteger(value) isFinite(value) isNaN(value) isSafeInteger(value) parseFloat(text) parseInt(text) MAX_SAFE_INTEGER MIN_SAFE_INTEGER EPSILON",
  String: "fromCharCode(...codes) fromCodePoint(...points) raw(strings,...values)", Promise: PROMISE_STATIC_JS, Date: DATE_STATIC_JS,
  document: "getElementById(id) querySelector(selector) querySelectorAll(selector) createElement(tag) createTextNode(text) body head title addEventListener(type,listener) activeElement",
  window: "addEventListener(type,listener) location navigator localStorage sessionStorage innerWidth innerHeight setTimeout(handler,ms) fetch(url,options) alert(message)",
  process: "argv env cwd() exit(code) platform pid stdout stderr stdin nextTick(callback) hrtime() memoryUsage() uptime()",
  Bun: "file(path) write(path,data) serve(options) spawn(command) sleep(ms) env argv version main password hash(data) $",
};

const PY_TYPES = {
  str: "capitalize() casefold() center(width) count(sub) encode() endswith(suffix) find(sub) format(*args) index(sub) isalnum() isalpha() isdigit() islower() isspace() isupper() join(iterable) ljust(width) lower() lstrip() partition(sep) replace(old,new) rfind(sub) rjust(width) rsplit(sep) rstrip() split(sep) splitlines() startswith(prefix) strip() title() upper() zfill(width)",
  list: "append(x) clear() copy() count(x) extend(iterable) index(x) insert(i,x) pop(i) remove(x) reverse() sort(key,reverse)",
  dict: "clear() copy() fromkeys(keys) get(key,default) items() keys() pop(key) popitem() setdefault(key,default) update(other) values()",
  set: "add(x) clear() copy() difference(other) discard(x) intersection(other) issubset(other) pop() remove(x) union(other) update(other)",
  os: "getcwd() listdir(path) mkdir(path) makedirs(path) remove(path) rename(src,dst) environ getenv(key) path system(command) walk(top) sep linesep name",
  sys: "argv exit(code) path platform stdin stdout stderr version modules executable",
  json: "dumps(obj) loads(text) dump(obj,fp) load(fp)",
  re: "compile(pattern) match(pattern,string) search(pattern,string) findall(pattern,string) sub(pattern,repl,string) split(pattern,string) fullmatch(pattern,string) IGNORECASE MULTILINE",
  math: "pi e sqrt(x) floor(x) ceil(x) pow(x,y) sin(x) cos(x) tan(x) log(x) exp(x) fabs(x) factorial(x) gcd(a,b) isnan(x) inf",
  random: "random() randint(a,b) choice(seq) shuffle(x) sample(population,k) uniform(a,b) seed(a)",
  time: "time() sleep(seconds) perf_counter() strftime(format) monotonic()",
};
const PY_GLOBALS = "print(*objects) len(obj) range(stop) int(x) str(x) float(x) bool(x) list(iterable) dict() set(iterable) tuple(iterable) sorted(iterable) reversed(seq) enumerate(iterable) zip(*iterables) map(func,iterable) filter(func,iterable) sum(iterable) min(iterable) max(iterable) abs(x) round(x) open(file,mode) input(prompt) isinstance(obj,cls) hasattr(obj,name) getattr(obj,name) setattr(obj,name,value) type(obj) super() any(iterable) all(iterable) repr(obj) format(value,spec) id(obj) iter(obj) next(it) chr(i) ord(c) hex(x) bin(x) divmod(a,b) pow(x,y) vars(obj) dir(obj) callable(obj) staticmethod classmethod property Exception ValueError TypeError KeyError IndexError RuntimeError";

const GO_TYPES = {
  fmt: "Println(a...) Printf(format,a...) Sprintf(format,a...) Sprint(a...) Errorf(format,a...) Fprintf(w,format,a...) Scanln(a...) Sscanf(str,format,a...)",
  strings: "Contains(s,substr) HasPrefix(s,prefix) HasSuffix(s,suffix) Index(s,substr) Join(elems,sep) Split(s,sep) Replace(s,old,new,n) ReplaceAll(s,old,new) ToLower(s) ToUpper(s) TrimSpace(s) Trim(s,cutset) Fields(s) Repeat(s,count) Builder",
  strconv: "Itoa(i) Atoi(s) ParseInt(s,base,bits) ParseFloat(s,bits) ParseBool(str) FormatInt(i,base) Quote(s)",
  os: "Args Exit(code) Getenv(key) ReadFile(name) WriteFile(name,data,perm) Open(name) Create(name) Stdout Stderr Stdin MkdirAll(path,perm) Remove(name)",
  errors: "New(text) Is(err,target) As(err,target) Unwrap(err) Join(errs...)",
  time: "Now() Since(t) Sleep(d) Duration Second Millisecond Minute Hour After(d) Tick(d) NewTimer(d)",
  sort: "Slice(x,less) Ints(x) Strings(x) Sort(data) Search(n,f)",
  sync: "WaitGroup Mutex RWMutex Once Pool Map",
  math: "Sqrt(x) Pow(x,y) Abs(x) Floor(x) Ceil(x) Max(x,y) Min(x,y) Pi MaxInt64 Inf(sign)",
  http: "Get(url) ListenAndServe(addr,handler) HandleFunc(pattern,handler) NewRequest(method,url,body) StatusOK Client",
  json: "Marshal(v) Unmarshal(data,v) NewEncoder(w) NewDecoder(r) MarshalIndent(v,prefix,indent)",
};

const RUST_TYPES = {
  String: "new() from(s) with_capacity(n)", Vec: "new() with_capacity(n) from(slice)",
  vec: "push(value) pop() len() is_empty() iter() iter_mut() into_iter() get(index) first() last() contains(x) insert(i,x) remove(i) clear() sort() sort_by(compare) dedup() extend(iter) join(sep) retain(f) truncate(n) swap(a,b)",
  str: "len() is_empty() chars() bytes() lines() split(pat) trim() to_string() to_owned() to_uppercase() to_lowercase() contains(pat) starts_with(pat) ends_with(pat) replace(from,to) parse() as_str() push_str(s) push(c) format()",
  option: "unwrap() expect(msg) unwrap_or(default) unwrap_or_else(f) unwrap_or_default() is_some() is_none() map(f) and_then(f) ok_or(err) as_ref() as_mut() take() cloned() filter(p)",
  result: "unwrap() expect(msg) unwrap_or(default) is_ok() is_err() map(f) map_err(f) and_then(f) ok() err() as_ref()",
  iter: "map(f) filter(f) collect() fold(init,f) sum() count() enumerate() zip(other) take(n) skip(n) rev() any(f) all(f) find(f) position(f) max() min() for_each(f) cloned() flat_map(f) chain(other)",
};
const RUST_GLOBALS = "println!(format) print!(format) eprintln!(format) format!(format) vec![items] panic!(msg) assert!(cond) assert_eq!(a,b) todo!() unimplemented!() dbg!(expr) Some(value) Ok(value) Err(error) Box Rc Arc RefCell Mutex HashMap HashSet BTreeMap VecDeque String Vec Option Result";

const JAVA_TYPES = {
  string: "length() charAt(index) substring(begin,end) indexOf(str) contains(s) equals(other) equalsIgnoreCase(other) isEmpty() isBlank() split(regex) trim() strip() toLowerCase() toUpperCase() replace(a,b) startsWith(prefix) endsWith(suffix) format(fmt,args) valueOf(x) join(delim,elements) toCharArray() compareTo(other)",
  list: "add(e) get(index) set(index,e) remove(index) size() isEmpty() contains(o) indexOf(o) clear() stream() forEach(action) sort(c) subList(a,b) addAll(c) iterator() toArray()",
  map: "put(k,v) get(k) getOrDefault(k,d) containsKey(k) containsValue(v) remove(k) size() isEmpty() keySet() values() entrySet() putIfAbsent(k,v) computeIfAbsent(k,f) forEach(action) clear()",
  System: "out err in currentTimeMillis() nanoTime() exit(status) getProperty(key) getenv(name) lineSeparator() arraycopy(src,srcPos,dest,destPos,length)",
  out: "println(x) print(x) printf(format,args) flush()",
  Math: "abs(x) max(a,b) min(a,b) pow(a,b) sqrt(x) floor(x) ceil(x) round(x) random() PI E sin(x) cos(x)",
};
JAVA_TYPES.array = JAVA_TYPES.list;
const CS_TYPES = {
  Console: "WriteLine(value) Write(value) ReadLine() ReadKey() Clear() Error Out In",
  string: "Length Contains(value) StartsWith(value) EndsWith(value) IndexOf(value) Substring(start,length) Split(separator) Trim() ToLower() ToUpper() Replace(a,b) Format(fmt,args) Join(sep,values) IsNullOrEmpty(value) IsNullOrWhiteSpace(value) PadLeft(width) PadRight(width)",
  list: "Add(item) AddRange(items) Remove(item) RemoveAt(index) Count Contains(item) Clear() Sort() Reverse() IndexOf(item) Find(match) FindAll(match) ForEach(action) ToArray() Insert(index,item)",
  Math: "Abs(x) Max(a,b) Min(a,b) Pow(a,b) Sqrt(x) Floor(x) Ceiling(x) Round(x) PI E Sin(x) Cos(x)",
  linq: "Where(predicate) Select(selector) OrderBy(key) OrderByDescending(key) First() FirstOrDefault() Last() Any() All(predicate) Count() Sum() Min() Max() ToList() ToArray() Distinct() GroupBy(key) Take(n) Skip(n)",
};
CS_TYPES.array = CS_TYPES.list;
const C_FUNCS = "printf(format,...) scanf(format,...) sprintf(buf,format,...) snprintf(buf,size,format,...) fprintf(stream,format,...) puts(s) putchar(c) getchar() fgets(buf,size,stream) fopen(path,mode) fclose(stream) fread(ptr,size,count,stream) fwrite(ptr,size,count,stream) malloc(size) calloc(n,size) realloc(ptr,size) free(ptr) memcpy(dst,src,n) memset(ptr,value,n) memcmp(a,b,n) strlen(s) strcpy(dst,src) strncpy(dst,src,n) strcmp(a,b) strncmp(a,b,n) strcat(dst,src) strchr(s,c) strstr(h,n) atoi(s) atof(s) strtol(s,end,base) abs(x) rand() srand(seed) exit(status) qsort(base,n,size,cmp) sqrt(x) pow(x,y) sin(x) cos(x) floor(x) ceil(x) time(t) assert(expr) isalpha(c) isdigit(c) toupper(c) tolower(c)";
const CPP_TYPES = {
  std: "cout cin cerr endl string vector map unordered_map set unordered_set list deque array pair tuple optional variant unique_ptr shared_ptr make_unique(args) make_shared(args) move(x) sort(first,last) find(first,last,value) min(a,b) max(a,b) swap(a,b) to_string(x) stoi(s) stod(s) getline(stream,str) function thread mutex lock_guard chrono ifstream ofstream stringstream runtime_error exception",
  vector: "push_back(x) emplace_back(args) pop_back() size() empty() clear() begin() end() front() back() at(i) insert(pos,x) erase(pos) resize(n) reserve(n) data() capacity()",
  string: "size() length() empty() substr(pos,len) find(str) rfind(str) c_str() append(s) push_back(c) erase(pos,len) replace(pos,len,str) compare(s) at(i) clear() front() back()",
  map: "size() empty() insert(pair) emplace(args) find(key) count(key) erase(key) clear() begin() end() at(key) contains(key)",
};
const PHP_FUNCS = "echo print strlen(string) str_replace(search,replace,subject) str_contains(haystack,needle) substr(string,offset,length) strpos(haystack,needle) strtolower(string) strtoupper(string) trim(string) explode(delimiter,string) implode(separator,array) count(array) array_map(callback,array) array_filter(array,callback) array_keys(array) array_values(array) array_merge(...arrays) array_push(array,...values) array_pop(array) in_array(needle,haystack) array_key_exists(key,array) sort(array) usort(array,callback) json_encode(value) json_decode(json) isset(var) empty(var) var_dump(value) print_r(value) file_get_contents(filename) file_put_contents(filename,data) date(format) time() sprintf(format,...values) intval(value) floatval(value) is_array(value) is_string(value) is_null(value) htmlspecialchars(string) preg_match(pattern,subject) preg_replace(pattern,replacement,subject) require_once(file) define(name,value)";
const RUBY_TYPES = {
  string: "length upcase downcase capitalize strip split(sep) include?(s) start_with?(s) end_with?(s) gsub(a,b) sub(a,b) reverse chars to_i to_f to_sym center(w) ljust(w) rjust(w) empty? each_char index(s) slice(a,b) format(*args)",
  array: "each map select reject reduce(init) first last push(x) pop shift unshift(x) sort sort_by length size include?(x) join(sep) uniq flatten compact reverse zip(other) take(n) drop(n) min max sum count find index(x) each_with_index group_by partition any? all? none? empty?",
  hash: "each keys values fetch(key) key?(k) merge(other) delete(k) map select reject to_a sort_by length size empty? dig(*keys) transform_values group_by",
};
const RUBY_GLOBALS = "puts(obj) print(obj) p(obj) require(lib) require_relative(path) raise(error) loop attr_accessor attr_reader attr_writer include extend format(fmt) sleep(sec) gets rand(max) lambda proc";
const SWIFT_GLOBALS = "print(items) debugPrint(items) fatalError(message) precondition(condition) assert(condition) min(a,b) max(a,b) abs(x) zip(a,b) stride(from,to,by) type(of) String Int Double Bool Array Dictionary Set Optional Result URL Date Data JSONDecoder JSONEncoder DispatchQueue FileManager UserDefaults";
const SWIFT_TYPES = { string: "count isEmpty uppercased() lowercased() hasPrefix(prefix) hasSuffix(suffix) contains(x) split(separator) trimmingCharacters(in) replacingOccurrences(of,with) components(separatedBy) first last", array: "count isEmpty append(x) remove(at) insert(x,at) map filter reduce(initial,next) sorted() sorted(by) first last contains(x) joined(separator) forEach reversed() firstIndex(of) removeAll() enumerated() compactMap flatMap" };
const KOTLIN_GLOBALS = "println(message) print(message) readLine() listOf(...elements) mutableListOf(...elements) mapOf(...pairs) mutableMapOf(...pairs) setOf(...elements) arrayOf(...elements) require(condition) check(condition) error(message) TODO() lazy(initializer) repeat(times,action) run(block) let(block) apply(block) also(block) with(receiver,block) String Int Double Boolean List Map Set Pair";
const KOTLIN_TYPES = { string: "length isEmpty() isBlank() trim() uppercase() lowercase() split(delimiter) contains(other) startsWith(prefix) endsWith(suffix) substring(start,end) replace(old,new) toInt() toDouble() first() last() format(args)", list: "size isEmpty() add(e) remove(e) get(i) map(transform) filter(predicate) forEach(action) first() last() sorted() sortedBy(selector) joinToString(separator) contains(e) any(predicate) all(predicate) find(predicate) groupBy(selector) take(n) drop(n) toList() toMutableList() indexOf(e) reduce(op) fold(init,op) sum() count()" };
const SHELL = "ls cd pwd echo cat grep sed awk find sort uniq head tail wc cut tr xargs tee mkdir rmdir rm cp mv touch chmod chown ln curl wget tar gzip gunzip zip unzip ssh scp rsync git docker make bun node npm python3 pip kill ps top df du date sleep read printf test exit export source alias unset set trap eval exec which type env";
const SQL_FUNCS = "count(expr) sum(expr) avg(expr) min(expr) max(expr) coalesce(a,b) nullif(a,b) length(s) lower(s) upper(s) substr(s,start,len) trim(s) replace(s,a,b) concat(a,b) round(x,digits) abs(x) now() date(x) cast(x) extract(part) row_number() rank() dense_rank() lag(x) lead(x) group_concat(x) json_extract(doc,path) ifnull(a,b) strftime(fmt,time)";

export const GLOBALS = {
  js: JS_GLOBALS, python: PY_GLOBALS, rust: RUST_GLOBALS, c: C_FUNCS, php: PHP_FUNCS, ruby: RUBY_GLOBALS, swift: SWIFT_GLOBALS, jvm: "", shell: SHELL, sql: SQL_FUNCS,
  go: "append(slice,elems...) cap(v) clear(v) close(c) copy(dst,src) delete(m,key) len(v) make(t,size) max(a,b) min(a,b) new(T) panic(v) print(args) println(args) recover() fmt strings strconv os errors time sort sync math http json",
};
GLOBALS.kotlin = KOTLIN_GLOBALS;
GLOBALS.java = "System String Math Integer Long Double Boolean Character List ArrayList Map HashMap Set HashSet Optional Arrays Collections Objects Thread StringBuilder Exception RuntimeException";
GLOBALS.csharp = "Console String Math Convert DateTime Guid List Dictionary HashSet Task File Path Environment Exception Array Enumerable";
GLOBALS.cpp = `${C_FUNCS} std`;
GLOBALS.v = V_GLOBALS;

/** Members by language and receiver type: lookup table used after "." / "::" / "->". */
export const TYPES = {
  js: JS_TYPES, v: V_TYPES, python: PY_TYPES, go: GO_TYPES, rust: RUST_TYPES, ruby: RUBY_TYPES, swift: SWIFT_TYPES, kotlin: KOTLIN_TYPES, java: JAVA_TYPES, csharp: CS_TYPES, cpp: CPP_TYPES,
};

/** Receiver names that map straight to a member table (languages with well-known objects). */
export const KNOWN_RECEIVERS = {
  js: ["console", "Math", "JSON", "Object", "Array", "Number", "String", "Promise", "Date", "document", "window", "process", "Bun"],
  python: ["os", "sys", "json", "re", "math", "random", "time"],
  go: ["fmt", "strings", "strconv", "os", "errors", "time", "sort", "sync", "math", "http", "json"],
  rust: ["String", "Vec"],
  java: ["System", "Math", "out", "err"], csharp: ["Console", "Math", "Convert"], kotlin: ["Math"],
  cpp: ["std"], v: V_RECEIVERS,
};

export const SQL_KEYWORDS = SPECS.sql.kw;

export const HTML_TAGS = "a abbr address article aside audio b blockquote body br button canvas caption code col details div dl dt dd em fieldset figure figcaption footer form h1 h2 h3 h4 h5 h6 head header hr html i iframe img input label legend li link main mark meta nav ol optgroup option p pre progress script section select small span strong style summary sup sub table tbody td template textarea tfoot th thead title tr u ul video svg path";
export const HTML_VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
export const HTML_ATTRS = "class id style title lang dir hidden tabindex href src alt width height type name value placeholder disabled checked readonly required rel target action method for min max step pattern maxlength autofocus autocomplete role draggable contenteditable spellcheck download charset content onclick onchange oninput onsubmit data- aria-label aria-hidden aria-expanded aria-describedby aria-live";

export const CSS_PROPS = "align-items align-content align-self animation animation-delay animation-duration appearance aspect-ratio background background-color background-image background-position background-repeat background-size border border-bottom border-collapse border-color border-left border-radius border-right border-style border-top border-width bottom box-shadow box-sizing clear color column-gap content cursor display filter flex flex-basis flex-direction flex-grow flex-shrink flex-wrap float font font-family font-size font-style font-weight gap grid grid-area grid-column grid-row grid-template-areas grid-template-columns grid-template-rows height inset justify-content justify-items justify-self left letter-spacing line-height list-style margin margin-bottom margin-left margin-right margin-top max-height max-width min-height min-width object-fit opacity order outline outline-offset overflow overflow-x overflow-y padding padding-bottom padding-left padding-right padding-top place-items pointer-events position resize right row-gap scroll-behavior text-align text-decoration text-overflow text-transform top transform transition user-select vertical-align visibility white-space width word-break z-index";
export const CSS_VALUES = {
  display: "block inline inline-block flex inline-flex grid none contents table", position: "static relative absolute fixed sticky", "flex-direction": "row column row-reverse column-reverse", "justify-content": "flex-start flex-end center space-between space-around space-evenly", "align-items": "stretch flex-start flex-end center baseline",
  overflow: "visible hidden scroll auto clip", "text-align": "left right center justify start end", "font-weight": "normal bold bolder lighter 100 200 300 400 500 600 700 800 900", "font-style": "normal italic oblique", cursor: "pointer default text move not-allowed grab wait help", "box-sizing": "border-box content-box",
  "text-decoration": "none underline line-through overline", "white-space": "normal nowrap pre pre-wrap pre-line", visibility: "visible hidden collapse", "flex-wrap": "nowrap wrap wrap-reverse", "object-fit": "fill contain cover none scale-down", "border-style": "none solid dashed dotted double groove",
  "text-transform": "none uppercase lowercase capitalize", "pointer-events": "auto none", "user-select": "auto none text all", "background-repeat": "repeat no-repeat repeat-x repeat-y",
};
export const CSS_COMMON_VALUES = "inherit initial unset revert auto none 0 100% 50% 1px 1rem 1em";
export const CSS_AT_RULES = "@media @import @font-face @keyframes @supports @layer @container @charset @page @namespace @property";
export const CSS_COLORS = "black white red green blue yellow orange purple pink brown gray grey silver gold navy teal olive maroon aqua lime fuchsia cyan magenta tomato coral salmon crimson indigo violet turquoise tan beige ivory khaki lavender plum orchid transparent currentColor";

export const YAML_COMMON = "true false null yes no on off version name description steps run uses with env jobs on branches services image ports volumes depends_on command";
export const TOML_COMMON = "name version description authors edition dependencies dev-dependencies features license repository readme keywords";

/** "push(...items) length" -> [{ name: "push", params: "...items", method: true }, { name: "length", params: "", method: false }] */
const parsedCache = new Map();
export function parseNames(list) {
  let out = parsedCache.get(list);
  if (out) return out;
  out = split(list).map((token) => {
    const open = token.indexOf("(");
    if (open < 0) return { name: token, params: "", method: false };
    return { name: token.slice(0, open), params: token.slice(open + 1, token.lastIndexOf(")")), method: true };
  });
  parsedCache.set(list, out);
  return out;
}

/** Keywords, built-in types and constants of a language (from the highlighter's tables). */
/** Which member tables a language uses: its own when it has one (Java, C#, Kotlin, C++ ...), else its family's. */
export const tableKey = (lang) => (TYPES[lang] ? lang : familyOf(lang));

export function languageWords(lang) {
  const spec = SPECS[lang];
  if (!spec) return { keywords: [], types: [], constants: [] };
  return { keywords: split(spec.kw), types: split(spec.types), constants: split(spec.consts) };
}
