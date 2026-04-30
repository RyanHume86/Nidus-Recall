/**
 * Minimal ambient declaration for sql.js.
 * The package ships no .d.ts files; this prevents tsc from checking sql-wasm.js.
 * Only the methods used in src/api/anki.js are declared here.
 */
declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  export interface Database {
    exec(sql: string): QueryExecResult[]
    close(): void
  }

  export interface SqlJsStatic {
    Database: new (data: Uint8Array) => Database
  }

  export interface SqlJsConfig {
    locateFile?: (path: string) => string
    wasmBinary?: Uint8Array
  }

  function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
  export default initSqlJs
}
