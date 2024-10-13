import dotenv from 'dotenv';
import grpc from '@grpc/grpc-js';
import { loadGrpcDefine } from './ProtoLoader.js';
dotenv.config();
const protoInstallDir = process.env.PROTO_INSTALL_DIR || '../../../protos';
const command_rpc = loadGrpcDefine(protoInstallDir+"/cmd.proto").cmd;

class TopicObject {
    constructor(topic) {
        this.topic = topic;
        this.handle_t = {database: false, real_time: false};
    }
    setHandler(handle_t) {
        if (handle_t.database !== this.handle_t.database || handle_t.real_time !== this.handle_t.real_time) {
            this.handle_t.database = handle_t.database;
            this.handle_t.real_time = handle_t.real_time;
            return true;
        }
        return false;
    }
};

class ParamObject {
    constructor(param) {
        this.param = param;
    }
};

class ServiceObject {
    constructor(service) {
        this.service = service;
    }
};


class NodeObject {
    constructor(node) {
        this.node = node;
        this.services = [];
        this.params = [];
    }
    upsertParam(param) {
        const index = this.params.findIndex(item => item.param === param);
        if (index === -1) {
            this.params.push(new ParamObject(param));
            return true;
        }
        return false;
    }
    upsertService(service) {
        const index = this.services.findIndex(item => item.service === service);
        if (index === -1) {
            this.services.push(new ServiceObject(service));
            return true;
        }
        return false;
    }
};

class MenuData {
    constructor() {
        this.nodes = [];
        this.topics = [];
        this.count = 0;
    }
    upsertTopic(topic) {
        const index = this.topics.findIndex(item => item.topic === topic);
        if (index === -1) {
            this.topics.push(new TopicObject(topic));
            this.count ++;
        }
    }
    upsertNode(node) {
        const index = this.nodes.findIndex(item => item.node === node);
        if (index === -1) {
            this.nodes.push(new NodeObject(node));
            this.count ++;
        }
    }
    upsertService(node, service) {
        const index = this.nodes.findIndex(item => item.node === node);
        if (index !== -1) {
            if (this.nodes.at(index).upsertService(service)) {
                this.count ++;
            }
        }
    }
    upsertParam(node, param) {
        const index = this.nodes.findIndex(item => item.node === node);
        if (index !== -1) {
            if (this.nodes.at(index).upsertParam(param)) {
                this.count ++;
            }
        }
    }
    
    deleteNode(node) {
        const index = this.nodes.findIndex(item => item.node === node);
        if (index !== -1) { 
            this.nodes.splice(index, 1); 
            this.count ++;
        }
    }
    upsertTopicHandler(topic, handle_t) {
        const index = this.topics.findIndex(item => item.topic === topic);
        if (index !== -1) {
            if (this.topics.at(index).setHandler(handle_t) ){
                this.count ++;
            }
        }
    }
};

export class NodeCommand {
    constructor () {
        this.clients = new Map();
        this.menu = new MenuData();
    }
    add_node(name, rpc_addr) {
        const client = new command_rpc.NodeCommand(rpc_addr, grpc.credentials.createInsecure());
        this.clients.set(name, client);
        this.menu.upsertNode(name);
        this.get_menu(name);
    }
    kill(name) {
        this.clients.get(name)?.kill({}, (error) => {
            if (error) {
                console.error('Error:', error);
            } else {
                console.log(`kill node ${name}`);
            }
        });
    }
    get_menu(name) {
        const call = this.clients.get(name)?.getInfo({type: 0x0F});
        call.on('data', (response)=>{
            response.topics.forEach(
                (topic)=> {
                    this.menu.upsertTopic(topic);
                }
            );
            response.services.forEach(
                (service)=> {
                    this.menu.upsertService(name, service);
                }
            );
            response.params.forEach(
                (param)=> {
                    this.menu.upsertParam(name, param);
                }
            );
        });
        call.on('end', ()=>{
            if (this.clients.has(name)) this.clients.delete(name);
            this.menu.deleteNode(name);
        });
        call.on('error', ()=>{
            if (this.clients.has(name)) this.clients.delete(name);
            this.menu.deleteNode(name);
        })
    }
};