"use strict";

import * as vscode from "vscode";
import { CodeCommand } from "./common/constants";
import { ConnectionNode } from "./model/database/connectionNode";
import { SchemaNode } from "./model/database/schemaNode";
import { UserGroup } from "./model/database/userGroup";
import { CopyAble } from "./model/interface/copyAble";
import { FunctionNode } from "./model/main/function";
import { FunctionGroup } from "./model/main/functionGroup";
import { ProcedureNode } from "./model/main/procedure";
import { ProcedureGroup } from "./model/main/procedureGroup";
import { TableGroup } from "./model/main/tableGroup";
import { TableNode } from "./model/main/tableNode";
import { TriggerNode } from "./model/main/trigger";
import { TriggerGroup } from "./model/main/triggerGroup";
import { ViewGroup } from "./model/main/viewGroup";
import { ViewNode } from "./model/main/viewNode";
import { ColumnNode } from "./model/other/columnNode";
import { Console } from "./common/Console";
// Don't change last order, it will occur circular reference
import { ServiceManager } from "./service/serviceManager";
import { QueryUnit } from "./service/queryUnit";
import { FileManager } from "./common/filesManager";
import { ConnectionManager } from "./service/connectionManager";
import { QueryNode } from "./model/query/queryNode";
import { QueryGroup } from "./model/query/queryGroup";
import { Node } from "./model/interface/node";
import { DbTreeDataProvider } from "./provider/treeDataProvider";
import { UserNode } from "./model/database/userNode";
import { EsConnectionNode } from "./model/es/model/esConnectionNode";
import { ESIndexNode } from "./model/es/model/esIndexNode";
import { activeEs } from "./model/es/provider/main";
import { RedisConnectionNode } from "./model/redis/redisConnectionNode";
import KeyNode from "./model/redis/keyNode";
import { DiffService } from "./service/diff/diffService";
import { DatabaseCache } from "./service/common/databaseCache";
import { FileNode } from "./model/ssh/fileNode";
import { SSHConnectionNode } from "./model/ssh/sshConnectionNode";
import { FTPFileNode } from "./model/ftp/ftpFileNode";
import { HistoryNode } from "./provider/history/historyNode";
import { ConnectService } from "./service/connect/connectService";

export function activate(context: vscode.ExtensionContext) {

    const serviceManager = new ServiceManager(context)

    activeEs(context)

    ConnectionNode.init()
    context.subscriptions.push(
        ...serviceManager.init(),
        vscode.window.onDidChangeActiveTextEditor(detectActive),
        ConnectService.listenConfig(),
        ...initCommand({
            // util
            ...{
                [CodeCommand.Refresh]: async (node: Node) => {
                    if (node) {
                        await node.getChildren(true)
                    } else {
                        DatabaseCache.clearCache()
                    }
                    DbTreeDataProvider.refresh(node)
                },
                [CodeCommand.RecordHistory]: (sql: string, costTime: number) => {
                    serviceManager.historyService.recordHistory(sql, costTime);
                },
                "dbclient.history.open": () => serviceManager.historyService.showHistory(),
                "dbclient.setting.open": () => {
                    serviceManager.settingService.open();
                },
                "dbclient.server.info": (connectionNode: ConnectionNode) => {
                    serviceManager.statusService.show(connectionNode)
                },
                "dbclient.name.copy": (copyAble: CopyAble) => {
                    copyAble.copyName();
                },
            },
            // connection
            ...{
                "dbclient.connection.add": () => {
                    serviceManager.connectService.openConnect(serviceManager.provider)
                },
                "dbclient.connection.edit": (connectionNode: ConnectionNode) => {
                    serviceManager.connectService.openConnect(connectionNode.provider, connectionNode)
                },
                "dbclient.connection.config": () => {
                    serviceManager.connectService.openConfig()
                },
                "dbclient.connection.open": (connectionNode: ConnectionNode) => {
                    connectionNode.provider.openConnection(connectionNode)
                },
                "dbclient.connection.disable": (connectionNode: ConnectionNode) => {
                    connectionNode.provider.disableConnection(connectionNode)
                },
                "dbclient.connection.delete": (connectionNode: ConnectionNode) => {
                    connectionNode.deleteConnection(context);
                },
                "dbclient.host.copy": (connectionNode: ConnectionNode) => {
                    connectionNode.copyName();
                },
            },
            // externel data
            ...{
                "dbclient.util.github": () => {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/cweijan/vscode-database-client'));
                },
                "dbclient.struct.diff": () => {
                    new DiffService().startDiff(serviceManager.provider);
                },
                "dbclient.data.export": (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).dump(node, true)
                },
                "dbclient.struct.export": (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).dump(node, false)
                },
                "dbclient.document.generate": (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).generateDocument(node)
                },
                "dbclient.data.import": (node: SchemaNode | ConnectionNode) => {
                    const importService=ServiceManager.getImportService(node.dbType);
                    vscode.window.showOpenDialog({ filters: importService.filter(), canSelectMany: false, openLabel: "Select sql file to import", canSelectFiles: true, canSelectFolders: false }).then((filePath) => {
                        if (filePath) {
                            importService.importSql(filePath[0].fsPath, node)
                        }
                    });
                },
            },
            // ssh
            ...{
                'dbclient.ssh.folder.new': (parentNode: SSHConnectionNode) => parentNode.newFolder(),
                'dbclient.ssh.file.new': (parentNode: SSHConnectionNode) => parentNode.newFile(),
                'dbclient.ssh.host.copy': (parentNode: SSHConnectionNode) => parentNode.copyIP(),
                'dbclient.ssh.forward.port': (parentNode: SSHConnectionNode) => parentNode.fowardPort(),
                'dbclient.ssh.file.upload': (parentNode: SSHConnectionNode) => parentNode.upload(),
                'dbclient.ssh.folder.open': (parentNode: SSHConnectionNode) => parentNode.openInTeriminal(),
                'dbclient.ssh.path.copy': (node: Node) => node.copyName(),
                'dbclient.ssh.socks.port': (parentNode: SSHConnectionNode) => parentNode.startSocksProxy(),
                'dbclient.ssh.file.delete': (fileNode: FileNode | SSHConnectionNode) => fileNode.delete(),
                'dbclient.ssh.file.open': (fileNode: FileNode | FTPFileNode) => fileNode.open(),
                'dbclient.ssh.file.download': (fileNode: FileNode) => fileNode.download(),
            },
            // database
            ...{
                "dbclient.db.active": () => {
                    serviceManager.provider.activeDb();
                },
                "dbclient.db.truncate": (databaseNode: SchemaNode) => {
                    databaseNode.truncateDb();
                },
                "dbclient.database.add": (connectionNode: ConnectionNode) => {
                    connectionNode.createDatabase();
                },
                "dbclient.db.drop": (databaseNode: SchemaNode) => {
                    databaseNode.dropDatatabase();
                }
            },
            // mock
            ...{
                "dbclient.mock.table": (tableNode: TableNode) => {
                    serviceManager.mockRunner.create(tableNode)
                },
                "dbclient.mock.run": () => {
                    serviceManager.mockRunner.runMock()
                },
            },
            // user node
            ...{
                "dbclient.change.user": (userNode: UserNode) => {
                    userNode.changePasswordTemplate();
                },
                "dbclient.user.grant": (userNode: UserNode) => {
                    userNode.grandTemplate();
                },
                "dbclient.user.sql": (userNode: UserNode) => {
                    userNode.selectSqlTemplate();
                },
            },
            // history
            ...{
                "dbclient.history.view": (historyNode: HistoryNode) => {
                    historyNode.view()
                }
            },
            // query node
            ...{
                "dbclient.runQuery": (sql:string) => {
                    if (typeof sql != 'string') { sql = null; }
                    QueryUnit.runQuery(sql, ConnectionManager.tryGetConnection());
                },
                "dbclient.runAllQuery": () => {
                    QueryUnit.runQuery(null, ConnectionManager.tryGetConnection(), { runAll: true });
                },
                "dbclient.query.switch": async (databaseOrConnectionNode: SchemaNode | ConnectionNode | EsConnectionNode | ESIndexNode) => {
                    if (databaseOrConnectionNode) {
                        await databaseOrConnectionNode.newQuery();
                    } else {
                        vscode.workspace.openTextDocument({ language: 'sql' }).then(async (doc) => {
                            vscode.window.showTextDocument(doc)
                        });
                    }
                },
                "dbclient.query.run": (queryNode: QueryNode) => {
                    queryNode.run()
                },
                "dbclient.query.open": (queryNode: QueryNode) => {
                    queryNode.open()
                },
                "dbclient.query.add": (queryGroup: QueryGroup) => {
                    queryGroup.add();
                },
                "dbclient.query.rename": (queryNode: QueryNode) => {
                    queryNode.rename()
                }
            },
            // redis
            ...{
                "dbclient.redis.connection.status": (connectionNode: RedisConnectionNode) => connectionNode.showStatus(),
                "dbclient.connection.terminal": (node: Node) => node.openTerminal(),
                "dbclient.redis.key.detail": (keyNode: KeyNode) => keyNode.detail(),
                "dbclient.redis.key.del": (keyNode: KeyNode) => keyNode.delete(),
            },
            // table node
            ...{
                "dbclient.show.esIndex": (indexNode: ESIndexNode) => {
                    indexNode.viewData()
                },
                "dbclient.table.truncate": (tableNode: TableNode) => {
                    tableNode.truncateTable();
                },
                "dbclient.table.drop": (tableNode: TableNode) => {
                    tableNode.dropTable();
                },
                "dbclient.table.source": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.showSource(); }
                },
                "dbclient.view.source": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.showSource(); }
                },
                "dbclient.table.show": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.openInNew(); }
                },
            },
            // column node
            ...{
                "dbclient.column.up": (columnNode: ColumnNode) => {
                    columnNode.moveUp();
                },
                "dbclient.column.down": (columnNode: ColumnNode) => {
                    columnNode.moveDown();
                },
                "dbclient.column.add": (tableNode: TableNode) => {
                    tableNode.addColumnTemplate();
                },
                "dbclient.column.update": (columnNode: ColumnNode) => {
                    columnNode.updateColumnTemplate();
                },
                "dbclient.column.drop": (columnNode: ColumnNode) => {
                    columnNode.dropColumnTemplate();
                },
            },
            // template
            ...{
                "dbclient.table.find": (tableNode: TableNode) => {
                    tableNode.openTable();
                },
                "dbclient.codeLens.run": (sql: string) => {
                    QueryUnit.runQuery(sql, ConnectionManager.tryGetConnection(), { split: true, recordHistory: true })
                },
                "dbclient.table.design": (tableNode: TableNode) => {
                    tableNode.designTable();
                },
            },
            // show source
            ...{
                "dbclient.show.procedure": (procedureNode: ProcedureNode) => {
                    procedureNode.showSource();
                },
                "dbclient.show.function": (functionNode: FunctionNode) => {
                    functionNode.showSource();
                },
                "dbclient.show.trigger": (triggerNode: TriggerNode) => {
                    triggerNode.showSource();
                },
            },
            // create template
            ...{
                "dbclient.template.sql": (tableNode: TableNode) => {
                    tableNode.selectSqlTemplate();
                },
                "dbclient.template.table": (tableGroup: TableGroup) => {
                    tableGroup.createTemplate();
                },
                "dbclient.template.procedure": (procedureGroup: ProcedureGroup) => {
                    procedureGroup.createTemplate();
                },
                "dbclient.template.view": (viewGroup: ViewGroup) => {
                    viewGroup.createTemplate();
                },
                "dbclient.template.trigger": (triggerGroup: TriggerGroup) => {
                    triggerGroup.createTemplate();
                },
                "dbclient.template.function": (functionGroup: FunctionGroup) => {
                    functionGroup.createTemplate();
                },
                "dbclient.template.user": (userGroup: UserGroup) => {
                    userGroup.createTemplate();
                },
            },
            // drop template
            ...{
                "dbclient.delete.user": (userNode: UserNode) => {
                    userNode.drop();
                },
                "dbclient.delete.view": (viewNode: ViewNode) => {
                    viewNode.drop();
                },
                "dbclient.delete.procedure": (procedureNode: ProcedureNode) => {
                    procedureNode.drop();
                },
                "dbclient.delete.function": (functionNode: FunctionNode) => {
                    functionNode.drop();
                },
                "dbclient.delete.trigger": (triggerNode: TriggerNode) => {
                    triggerNode.drop();
                },
            },
        }),
    );

}

export function deactivate() {
}

function detectActive(): void {
    const fileNode = ConnectionManager.getByActiveFile();
    if (fileNode) {
        ConnectionManager.changeActive(fileNode);
    }
}

function commandWrapper(commandDefinition: any, command: string): (...args: any[]) => any {
    return (...args: any[]) => {
        try {
            commandDefinition[command](...args);
        }catch (err) {
            Console.log(err);
        }
    };
}

function initCommand(commandDefinition: any): vscode.Disposable[] {

    const dispose = []

    for (const command in commandDefinition) {
        if (commandDefinition.hasOwnProperty(command)) {
            dispose.push(vscode.commands.registerCommand(command, commandWrapper(commandDefinition, command)))
        }
    }

    return dispose;
}


// refrences
// - when : https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts