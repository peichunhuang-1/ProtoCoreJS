import dotenv from 'dotenv';
import grpc from '@grpc/grpc-js';
import { loadProtosFromDirs, loadGrpcDefine } from './ProtoLoader.js';
import {PublisherHandler} from './PublisherHandler.js'
import {SubscriberHandler} from './SubscriberHandler.js'
import {TransformHandler} from './TransformHandler.js'
import {NodeCommand} from './NodeCommand.js'
import {InfluxDBInterface} from './InfluxDBInterface.js'
dotenv.config();
const protoInstallDir = process.env.PROTO_INSTALL_DIR || '../../../protos';

const root = loadProtosFromDirs([protoInstallDir]);
const connection_rpc = loadGrpcDefine(protoInstallDir+"/rscl.proto").rscl;
const regist_rpc = loadGrpcDefine(protoInstallDir+"/registrar.proto").registrar;

export class NodeHandler {
    constructor(name, namespace) {
        this.node_name = namespace + "/" + name;
        this.db = new InfluxDBInterface(this.node_name);
        if (`${process.env.CORE_LOCAL_IP}` === undefined) this.local_ip = `${process.env.CORE_LOCAL_IP}`;
        else this.local_ip = "127.0.0.1";
        if (`${process.env.CORE_MASTER_ADDR}` === undefined) this.srv_addr = `${process.env.CORE_MASTER_ADDR}`;
        else this.srv_addr = "127.0.0.1:50051";
        this.node_clients = new Map();
        this.master_client = new regist_rpc.Registration(this.srv_addr, grpc.credentials.createInsecure());

        this.node_commander = new NodeCommand();

        this.subscriber_handler = new SubscriberHandler(root, this.node_name);
        this.publisher_handler = new PublisherHandler(root);
        // this.parameters_handler = new ParameterHandler(root);
        this.transforms_handler = new TransformHandler(root, this.subscriber_handler);

        this.connection_server = new grpc.Server();
        this.connection_server.addService(connection_rpc.NodeConnection.service,{
            TopicConnection: async (call, callback) => {
            const request = call.request;
            try {
                const result = await this.publisher_handler.handle_subscribers_request(request);
                callback(null, result);
            } catch (err) {
                console.error(err);
                callback({
                    code: grpc.status.INTERNAL,
                    details: err.message
                });
            }
            }
        });
        this.connection_server.bindAsync(this.local_ip+':0', grpc.ServerCredentials.createInsecure(), (err, port) => {
            if (err) {
                console.error(err);
                return;
            }
            this.rpc_port = port;
            const request = {
                info: {
                    node_name: this.node_name,
                    ip: this.local_ip,
                    port: this.rpc_port,
                    code: 0 // ADD
                }
            };
            this.call = this.master_client.Regist(request);
            this.call.on('data', (response_array) => {
                this.registrar_response(response_array);
            });
        
            this.call.on('end', () => {
                console.log('Stream ended.');
            });
        
            this.call.on('error', (error) => {
                console.error(error);
            });
        });

    }
    registrar_response(response_array) {
        for (const response of response_array.operation_cmd) {
            if (response.code == 'ADD') {
                const client = new connection_rpc.NodeConnection(response.ip + ":" + response.port, grpc.credentials.createInsecure());
                this.node_clients.set(
                    response.node_name,
                    client
                ); 
                this.subscriber_handler.add_new_node(response.node_name, client);
                this.node_commander.add_node(response.node_name, response.ip + ":" + response.port);
            } else {
                if (this.node_clients.has(response.node_name)) {
                    this.node_clients.delete(response.node_name);
                    this.subscriber_handler.delete_node(response.node_name);
                }
            }
        }
    }
    getMenu(count) {
        if (count !== this.node_commander.menu.count) {
            return {
                nodes: this.node_commander.menu.nodes,
                topics: this.node_commander.menu.topics,
                count: this.node_commander.menu.count
            };
        } else {
            return {count: this.node_commander.menu.count};
        }
    }
    topicSetting(topic, handle_t) {
        console.log(topic);
        const handler = {
            handle: (data, decoder) => {
                if (handle_t.database) {
                    this.db.writeTopicData(topic, data, decoder.fullName.replace(/^\./, ''));
                }
                if (handle_t.real_time) {
                    console.log("transfer to real time");
                }
            }
        };
        this.subscriber_handler.add_subscriber(topic, handler);
        this.node_commander.menu.upsertTopicHandler(topic, handle_t);
    }

};
