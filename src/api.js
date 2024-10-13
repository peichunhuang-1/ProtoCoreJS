import express from 'express';
import cors from 'cors';
// import {InfluxDB, Point} from '@influxdata/influxdb-client';
import {NodeHandler} from './NodeHandler.js';
import dotenv from 'dotenv';

dotenv.config();
export class api {
    constructor() {
        const protocorejs_api_addr = process.env.CORE_JS_WEB_ADDR || "http://localhost:50052";
        this.nh = new NodeHandler('js', 'js');
        this.app = express();
        this.app.use(express.json());
        this.app.use(cors());
        this.app.post('/menu', (req, res) => this.menu(req, res));
        this.app.post('/menu/topics', (req, res) => this.topic_setting(req, res));
        const url = new URL(protocorejs_api_addr);
        this.app.listen(url.port, url.hostname, () => {
            console.log(`Server is running on ${protocorejs_api_addr}`);
        });
    }
    menu(req, res) {
        const res_json = this.nh.getMenu(req.body.count);
        res.json(res_json);
    }
    topic_setting(req, res) {
        this.nh.topicSetting(req.body.topic, req.body.handle_t);
        res.json({});
    }
};

const server = new api();