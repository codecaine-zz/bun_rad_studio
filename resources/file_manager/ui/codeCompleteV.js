// Word lists for completing V (vlang 0.5.2): built-in functions, standard modules, and the members of common modules and
// types. Same format as codeCompleteData.js: space-separated names, "name(params)" for functions and methods.

export const V_GLOBALS = "println(s) print(s) eprintln(s) eprint(s) panic(msg) exit(code) error(msg) error_with_code(msg,code) dump(x) typeof(x) sizeof(x) isnil(ptr) arguments() flush_stdout() flush_stderr() print_backtrace() ptr_str(ptr) malloc(n) memdup(src,size) free(ptr) vcalloc(n) unbuffer_stdout() panic_n(msg,n) ";

export const V_MODULES = "os strings strconv math math.big math.bits math.complex math.stats time rand rand.seed json x.json2 net net.http net.urllib net.html net.websocket net.smtp io io.util arrays maps os.cmdline os.notify flag cli encoding.base64 encoding.hex encoding.binary encoding.csv encoding.utf8 crypto.sha256 crypto.sha1 crypto.sha512 crypto.md5 crypto.rand crypto.hmac crypto.aes crypto.bcrypt hash hash.fnv1a hash.crc32 regex sync sync.stdatomic sync.pool term term.ui ui gg gx sokol sqlite db.pg db.mysql db.sqlite vweb veb toml x.toml v.ast v.parser v.token v.pref v.util v.builder log bitfield datatypes dl eventbus context compress.zlib compress.gzip semver readline picoev picohttpparser szip stbi orm";

const STRING = "len str() clone() bytes() runes() split(sep) split_into_lines() split_nth(sep,n) trim(cutset) trim_space() trim_left(cutset) trim_right(cutset) trim_prefix(p) trim_suffix(s) contains(sub) contains_any(chars) contains_only(chars) replace(old,new) replace_each(pairs) to_upper() to_lower() starts_with(p) ends_with(s) int() i64() u64() f32() f64() u8() substr(start,end) index(sub) index_after(sub,start) last_index(sub) join(arr) fields() title() capitalize() is_upper() is_lower() is_title() is_capital() is_int() is_bin() is_hex() count(sub) repeat(n) reverse() all_after(sub) all_before(sub) all_after_last(sub) all_before_last(sub) after(sub) before(sub) limit(n) hash() bytestr() is_blank() is_ascii() normalize_tabs(n) pad_left(n) pad_right(n) find_between(a,b) wrap(width) strip_margin() starts_with_capital() runes_iterator()";
const ARRAY = "len cap data map(fn) filter(fn) sort(cond) sorted(cond) sort_with_compare(fn) reverse() reverse_in_place() contains(x) index(x) first() last() pop() pop_left() delete(i) delete_many(i,n) delete_last() insert(i,x) prepend(x) push(x) push_many(src,n) clone() join(sep) any(fn) all(fn) count(fn) each(fn) each_with_index(fn) reduce(fn,init) fold(init,fn) clear() trim(n) drop(n) take(n) repeat(n) slice(start,end) has(x) filter_with_index(fn) map_with_index(fn) grow_cap(n) grow_len(n) flatten() group() chunk(size) window(size) min() max() sum() wait()";
const MAP = "len keys() values() delete(key) clone() exists(key) clear() reserve(n) move() to_array(fn) free()";
const OS = "read_file(path) write_file(path,text) ls(path) getenv(name) setenv(name,value,overwrite) unsetenv(name) args exists(path) is_dir(path) is_file(path) is_link(path) mkdir(path) mkdir_all(path) rm(path) rmdir(path) rmdir_all(path) cp(src,dst) cp_all(src,dst,overwrite) mv(src,dst) rename(src,dst) join_path(a,b) join_path_single(a,b) home_dir() temp_dir() cache_dir() config_dir() executable() getwd() chdir(path) execute(cmd) execute_or_panic(cmd) system(cmd) input(prompt) input_opt(prompt) create(path) open(path) open_file(path,mode) read_lines(path) read_bytes(path) write_lines(path,lines) glob(pattern) file_name(path) base(path) dir(path) file_ext(path) real_path(path) abs_path(path) walk(path,fn) walk_ext(path,ext) getpid() hostname() user_os() uname() expand_tilde_to_home(path) new_process(path) stdin() stdout() stderr() Process File Result Signal path_separator";
const STRINGS = "Builder new_builder(n) repeat(c,n) levenshtein_distance(a,b) dice_coefficient(a,b) find_between_pair_u8(s,a,b) split_capital(s) title(s) substr_with_index(s,a,b) textscanner";
const STRCONV = "atoi(s) parse_int(s,base,bits) parse_uint(s,base,bits) parse_float(s) format_int(n,base) format_uint(n,base) quote(s) unquote(s) v_sprintf(f) ParseUintError";
const MATH = "pi e tau sqrt(x) pow(x,y) abs(x) min(a,b) max(a,b) floor(x) ceil(x) round(x) trunc(x) sin(x) cos(x) tan(x) asin(x) acos(x) atan(x) atan2(y,x) log(x) log2(x) log10(x) exp(x) hypot(a,b) clamp(x,lo,hi) gcd(a,b) factorial(n) cbrt(x) radians(deg) degrees(rad) inf(sign) nan() is_nan(x) is_inf(x,sign) max_i32 min_i32 max_i64 min_i64 max_u32 max_u64 sqrt2 ln2";
const TIME = "now() sleep(d) Duration Time ms millisecond second minute hour utc() unix(sec) parse(s) parse_rfc3339(s) since(t) ticks() new(params) nanosecond microsecond day week";
const RAND = "int() intn(n) int_in_range(a,b) u32() u64() f32() f64() string(n) ascii(n) hex(n) bytes(n) seed(s) u64n(n) shuffle(arr) choice(arr) new_default() uuid_v4() element(arr)";
const JSON = "encode(x) decode(T,s) encode_pretty(x) raw_decode(s) Any";
const HTTP = "get(url) post(url,body) post_json(url,body) post_form(url,data) put(url,body) delete(url) head(url) fetch(config) get_text(url) Request Response Header Method Status Server new_request(m,url,body) status_from_int(n) FetchConfig";
const ARRAYS = "chunk(a,size) concat(a,b) flatten(a) group_by(a,fn) max(a) min(a) sum(a) reduce(a,fn,init) fold(a,init,fn) merge(a,b) window(a,size) zip(a,b) partition(a,fn) find_first(a,fn) find_last(a,fn) binary_search(a,v) copy(a) flat_map(a,fn) each_with_index(a,fn) filter_indexed(a,fn) map_indexed(a,fn) rotate_left(a,n) rotate_right(a,n) take(a,n) skip(a,n)";
const FLAG = "new_flag_parser(args) FlagParser bool(name,short,default,usage) int(name,short,default,usage) string(name,short,default,usage) float(name,short,default,usage) finalize() usage() application(name) version(v) description(d) skip_executable()";
const SYNC = "new_mutex() Mutex RwMutex WaitGroup new_waitgroup() add(n) done() wait() lock() unlock() rlock() runlock() Channel Once Pool";
const TERM = "clear() red(s) green(s) blue(s) yellow(s) cyan(s) magenta(s) gray(s) bold(s) dim(s) italic(s) underline(s) bg_red(s) bg_green(s) bg_blue(s) colorize(f,s) set_cursor_position(c) hide_cursor() show_cursor() get_terminal_size() can_show_color_on_stdout() ok_message(s) fail_message(s) warn_message(s)";
const REGEX = "regex_opt(pattern) new() Regex RE find(text) find_all(text) matches_string(text) replace(text,repl) replace_simple(text,repl) split(text) match_string(text) get_group_by_name(text,name) get_query()";
const BASE64 = "encode(data) encode_str(s) decode(s) decode_str(s) url_encode(data) url_decode(s) url_encode_str(s) url_decode_str(s)";
const HEX = "encode(data) decode(s)";
const SHA = "sum(data) sum256(data) hexhash(s) new() Digest";
const LOG = "Log new() set_level(l) info(s) warn(s) error(s) debug(s) fatal(s) set_output_path(p) set_output_label(l) get_level() Level";
const SQLITE = "connect(path) exec(q) exec_one(q) exec_none(q) q_int(q) q_string(q) close() get_affected_rows_count() last_insert_rowid() Row DB";
const VEB = "Context Middleware run(app,port) run_at(app,params) text(s) html(s) json(x) file(path) redirect(url) not_found() server_error(code) ok(s) request_error(s) form query req res get_header(h) set_cookie(c) get_cookie(n) Result StaticHandler handle_static(dir,root) mount_static_folder_at(dir,mount)";
const TOML = "parse_file(path) parse_text(s) decode(T,s) encode(x) Doc Any to_any() value(key) value_opt(key)";
const UTF8 = "len(s) is_valid(s) validate_str(s) get_uchar(s,i) char_len(b) utf8_str_visible_length(s) west_european_upper(s) east_asian_width_at(s,i)";
const IO = "read_all(r) read_any(r) new_buffered_reader(config) BufferedReader Reader Writer cp(src,dst) read_line() ReaderWriter";
const CHAN = "close() len cap try_push(x) try_pop(x)";

export const V_TYPES = {
  string: STRING, array: ARRAY, map: MAP, os: OS, strings: STRINGS, strconv: STRCONV, math: MATH, time: TIME, rand: RAND, json: JSON, "x.json2": JSON, http: HTTP, arrays: ARRAYS,
  flag: FLAG, sync: SYNC, term: TERM, regex: REGEX, base64: BASE64, hex: HEX, sha256: SHA, sha1: SHA, sha512: SHA, md5: SHA, log: LOG, sqlite: SQLITE, veb: VEB, vweb: VEB, toml: TOML, utf8: UTF8, io: IO, chan: CHAN,
  builder: "write_string(s) write_u8(b) write_rune(r) writeln(s) str() len cap clear() free() go_back(n) cut_last(n) cut_to(n) last_n(n) after(n) write_decimal(n) write_byte(b) write_runes(rs) drain_builder(other,n) reuse_as_plus_equals()",
  option: "str()", error: "msg() code() str()",
  Duration: "nanoseconds() microseconds() milliseconds() seconds() minutes() hours() str()",
  Time: "format() format_ss() format_rfc3339() unix() unix_milli() unix_micro() unix_nano() year month day hour minute second nanosecond add(d) add_days(n) add_seconds(n) subtract(t) days_from_unix_epoch() weekday() day_of_week() is_local() local() utc() relative() custom_format(f) ymmdd() hhmmss() http_header_string()",
  File: "write(data) write_string(s) writeln(s) read(buf) read_bytes(n) close() flush() seek(off,whence) tell() eof() is_opened write_to(pos,data) read_into_ptr(ptr,n) write_ptr(ptr,n)",
  Process: "run() wait() close() signal_kill() signal_term() set_args(a) set_redirect_stdio() stdout_read() stderr_read() stdin_write(s) is_alive() code status pid",
  Request: "do() add_header(k,v) add_custom_header(k,v) method url data header cookies",
  Response: "body status_code status_msg header status() bytes()",
  Mutex: "lock() unlock() rlock() runlock()", WaitGroup: "add(n) done() wait()",
  rune: "str() length_in_bytes() to_upper() to_lower() is_letter() is_digit() is_space()",
  u8: "ascii_str() is_letter() is_digit() is_space() is_alnum() is_hex_digit() is_capital() hex() str() is_bin_digit()",
  int: "str() hex() hex2() bin() oct() abs() clamp(a,b) f64() f32() u8() i64() u64() i16() u16() u32() hex_full() is_pow2()",
  f64: "str() eq_epsilon(x) strg() strsci(n) strlong() abs() sqrt() round() floor() ceil() int() i64() f32() clamp(a,b) fix()",
  bool: "str() int() ok",
};

/** Receiver names that go straight to a member table: module names written in code after `import`. */
export const V_RECEIVERS = ["os", "strings", "strconv", "math", "time", "rand", "json", "http", "arrays", "flag", "sync", "term", "regex", "base64", "hex", "sha256", "sha1", "sha512", "md5", "log", "sqlite", "veb", "vweb", "toml", "utf8", "io"];

/** The last part of a module path is what code writes: `import net.http` -> `http.`, `import x.json2` -> `json2.`. */
export const V_MODULE_ALIASES = { json2: "x.json2", stdatomic: "sync", cmdline: "os", urllib: "http", big: "math" };

/** Struct attributes offered after `@[`. */
export const V_ATTRIBUTES = "inline noinline heap params required deprecated: deprecated_after: json: sql: table: unsafe flag export: manualfree noreturn markused direct_array_access minify packed typedef trusted c_extern weak console windows_stdcall keep_args_alive callconv: skip_unused comptime_for if";

/** Compile-time words offered after `$`. */
export const V_COMPTIME = "if else for env() embed_file() tmpl() compile_error() compile_warn() d() res() pkgconfig() vweb veb fn";
