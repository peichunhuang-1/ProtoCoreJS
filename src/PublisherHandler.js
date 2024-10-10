import net from 'net';
import protobuf from 'protobufjs';

export class PublisherHandler{
    constructor(root){
        this.root = root;
        this.published_map = new Map();
        this.pendingRequests = new Map();
        this.clients = new Map();
        this.encoders = new Map();
    }
    async handle_subscribers_request(request)  {
        if (this.published_map.has(request.object) && this.published_map.get(request.object) === request.url) {
            return await this.get_client_info(request);
        } else {
            return new Promise((resolve) => {
                if (!this.pendingRequests.has(request.object)) {
                    this.pendingRequests.set(request.object, []);
                }
                this.pendingRequests.get(request.object).push({ request, resolve });
            });
        }
    }
    add_publisher(topic, url) {
        const fqn = url.replace("type.googleapis.com/", "");
        this.encoders.set(topic, this.root.lookupType(fqn));
        this.published_map.set(topic, url);
        if (this.pendingRequests.has(topic)) {
            const requests = this.pendingRequests.get(topic);
            requests.forEach(({ request, resolve }) => {
                if (request.url === url) {
                    resolve(this.get_client_info(request));
                }
            });
            this.pendingRequests.delete(topic);
        }
    }
    async create_tcp_client(request) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            client.connect(request.port, request.ip, () =>{
                console.log(`Connection for topic ${request.object} created to ${request.ip}:${request.port}`);
                const client_ip = client.address().address;
                const client_port = client.address().port;
                if (!this.clients.has(request.object)) this.clients.set(request.object, new Set());
                this.clients.get(request.object).add(client);
                return resolve({ 
                    object: request.object,
                    ip: client_ip,
                    port: client_port,
                    url: request.url
                });
            });
            client.on('error', (err) => {
                this.clients.get(request.object)?.delete(client);
                console.error('Client error:', err);
                if (reject) {
                    reject(err);
                }
            });
            client.on('close', () => {
                console.log(`Connection closed for topic ${request.object}`);
                this.clients.get(request.object)?.delete(client);
            });
        });
    }

    async get_client_info (request) {
        return await this.create_tcp_client(request);
    }

    publish(topic, msg) {
        if (!this.encoders.has(topic)) return false;
        const buffer = this.encoders.get(topic).encode(msg).finish();
        const messageLength = buffer.length;
        const prefixedBuffer = Buffer.alloc(4 + messageLength);
        prefixedBuffer.writeUInt32LE(messageLength, 0);
        buffer.copy(prefixedBuffer, 4);
        if (!this.clients.has(topic)) return false;
        this.clients.get(topic).forEach(
            client=>{client.write(prefixedBuffer);}
        )
        return true;
    }

};