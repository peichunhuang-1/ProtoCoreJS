import {InfluxDB, Point} from '@influxdata/influxdb-client';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

export class InfluxDBInterface {
    constructor(session_name, project) {
        var url;
        if (!process.env.INFLUXDB_ADDR) {
            url = 'http://localhost:8086'
        } else {
            url = process.env.INFLUXDB_ADDR;
        }
        const token = process.env.INFLUXDB_API_KEY;
        console.log(url);
        if (!token) {
            console.error("Failed to get API key of InfluxDB, set in your .env");
            return ;
        }
        this.project = project === undefined? "default" : project;
        this.client = new InfluxDB({url, token});
        this.writeClient = this.client.getWriteApi("ProtoCore", session_name, 'ns');
        console.log(`Save to Bucket: ${session_name}, Project: ${this.project}`)
        this.autoflush = setInterval(() => {
            this.writeClient.flush();
        }, 5000);
    }
    writeTopicData(topic, buffer, message_type) {
        console.log(buffer);
        const payload = buffer.toString('base64');
        console.log(payload);
        let point = new Point(this.project)
            .tag('topic', topic)
            .tag('message_t', message_type)
            .stringField('payload', payload);
        try {
            this.writeClient.writePoint(point);
            console.log("Point written successfully");
        } catch (err) {
            console.error("Error writing point:", err);
        }
    }
};