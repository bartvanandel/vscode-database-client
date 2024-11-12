import * as child_process from 'child_process';
import { StreamParser } from './streamParser';
import { ResultSetParser } from './resultSetParser';
import { EOL } from 'os';
import { Result, ResultNew, ResultSet } from "./common";
import { getSqliteCommandArguments, getSqliteCommand, getSqliteInitQueries, validateSqliteCommand } from "./sqliteCommandValidation";
import { FieldInfo } from "../../../common/typeDef";

class SQLite {

    public readonly dbPath: string;
    private command!: string;
    private args: string[] = [];
    private initQueries: string[] = [];

    constructor(dbPath: string) {
        this.dbPath = dbPath;
        this.setSqliteCommand(
            getSqliteCommand(),
            getSqliteCommandArguments(),
            getSqliteInitQueries()
        );
    }

    query(query: string): Promise<ResultNew | ResultNew[]> {
        return new Promise((res, rej) => {
            if (!this.command) {
                return rej({ error: "Unable to execute query: provide a valid SQLite executable in the setting dbclient.sqliteCmd." });
            }

            let resultSet: Array<Result>;
            let errorMessage = "";
            let streamParser = new StreamParser(new ResultSetParser());

            let args = [
                ...this.args,
                //dbPath,  // open using query command to prevent load error due to unicode handling on Windows; see e.g. vscode-sqlite github #32, #37.
            ];

            let proc = child_process.spawn(this.command, args, { stdio: ["pipe", "pipe", "pipe"] });
            for (const q of [
                `.open '${this.dbPath}'`,
                ...this.initQueries,
                '.mode tcl',
                '.headers on',  // print the headers before the result rows
                '.nullvalue NULL',  // print NULL for null values
                '.echo on',  // print the statement before the result
            ]) {
                proc.stdin.write(`${q}${EOL}`);
            }
            proc.stdin.end(query);

            proc.stdout.pipe(streamParser).once('done', (data: ResultSet) => {
                resultSet = data;
            });

            proc.stderr.on('data', (data) => {
                errorMessage += data.toString().trim();
            });

            proc.once('error', (data) => {
                errorMessage += data;
            });

            proc.once('close', () => {
                if (errorMessage) {
                    rej(new Error(errorMessage))
                    return;
                }
                if (!resultSet) resultSet = [{
                    stmt: query, rows: [], header: []
                }];
                const newResult = resultSet.map(result => {
                    return {
                        sql: result.stmt,
                        fields: result.header.map(head => ({ name: head })) as FieldInfo[],
                        rows: result.rows.map((row) => {
                            const obj = {};
                            for (let i = 0; i < result.header.length; i++) {
                                const head = result.header[i];
                                obj[head] = row[i];
                            }
                            return obj;
                        })
                    }
                })
                if (newResult.length == 1) {
                    res(newResult[0])
                } else {
                    res(newResult);
                }
            });
        })
    }

    setSqliteCommand(sqliteCommand: string, sqliteCmdArgs?: string[], initQueries?: string[]) {
        this.command = validateSqliteCommand(sqliteCommand);
        this.args = sqliteCmdArgs ?? [];
        this.initQueries = initQueries ?? [];
    }
}

export interface QueryResult { resultSet?: ResultSet; error?: Error; }

export default SQLite;