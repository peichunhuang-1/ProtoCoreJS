import net from 'net';

export class SubscriberHandler {
    constructor(root, node_name){
        this.node_name = node_name;
        if (`${process.env.CORE_LOCAL_IP}` === undefined) this.ip = `${process.env.CORE_LOCAL_IP}`;
        else this.ip = '127.0.0.1';

        this.root = root;
        this.subscribed_map = new Map();
        this.node_clients = new Map();
        this.encoders = new Map();
        this.key_to_topic = new Map();
        this.server = net.createServer((socket) => {
            const clt_ip = socket.remoteAddress;
            const clt_port = socket.remotePort;
            const key = clt_ip + ":" + clt_port;
            var buffer = Buffer.alloc(0);
            socket.on('data', (data) => {
                buffer = Buffer.concat([buffer, data]);
                buffer = this.handle_received_data(buffer, key);
            });
            socket.on('end', () => {
                if (this.key_to_topic.has(key)) {
                    this.key_to_topic.delete(key);
                }
                console.log('Client disconnected.');
            });
        });
        this.port = new Promise ((resolve, reject) => {
            this.server.listen(0, this.ip, () => {
                resolve(this.server.address().port);
            });
            this.server.on('error', (err) => {
                reject(err);
            });
        });
    }
    handle_received_data(buffer, key) {
        if (!this.key_to_topic.has(key)) return buffer;
        const topic = this.key_to_topic.get(key).topic;
        const type = this.key_to_topic.get(key).url;
        const fqn = type.replace("type.googleapis.com/", "");
        while (buffer.length >= 4) { 
            const messageLength = buffer.readUInt32LE(0);
            if (messageLength == 0) {
                buffer = buffer.slice(4);
                break;
            }
            if (buffer.length >= 4 + messageLength) {
                const messageData = buffer.slice(4, 4 + messageLength);
                this.subscribed_map.get(topic)?.handle(messageData, this.root.lookupType(fqn));
                buffer = buffer.slice(4 + messageLength);
            } else {
                break;
            }
        }
        return buffer;
    }
    add_subscriber(topic, cb_handler) {
        this.port.then((tcp_port)=>{
            this.subscribed_map.set(topic, cb_handler);
            const request = { 
                object: topic,
                ip: this.ip,
                port: tcp_port,
                url: '*',
                node_name: this.node_name
            };
            this.node_clients.forEach((client, key) => {
                client.TopicConnection(request, (error, response) => {
                    if (error) {
                        console.error('Error:', error);
                    } else {
                        this.map_key_to_topic(response.ip+':'+String(response.port), response.object, response.url);
                    }
                });
            });
        }).catch((err)=>{
            console.log(err);
        });
    }
    add_new_node(node_name, client) {
        this.port.then((tcp_port)=>{
            this.subscribed_map.forEach((value, key)=>{
                const request = { 
                    object: key,
                    ip: this.ip,
                    port: tcp_port,
                    url: '*',
                    node_name: this.node_name
                };
                client.TopicConnection(request, (error, response) => {
                    if (error) {
                        console.error('Error:', error);
                    } else {
                        this.map_key_to_topic(response.ip+':'+String(response.port), response.object, response.url);
                    }
                });
            });
            this.node_clients.set(node_name, client);
        }).catch((err)=>{
            console.log(err);
        });
    }
    delete_node(node_name) {
        if (this.node_clients.has(node_name)) {
            this.node_clients.delete(node_name);
        }
    }
    map_key_to_topic(key, topic, url) {
        this.key_to_topic.set(key, {
            topic: topic,
            url: url
        });
    }
};