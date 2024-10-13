import {NodeHandler} from '../src/NodeHandler.js';

const nh = new NodeHandler('publisher', 'js');
nh.publisher_handler.add_publisher("hello", "type.googleapis.com/std_msgs.String");
var counter = 1;
const intervalId = setInterval(() => {
    nh.publisher_handler.publish("hello", {data: String(counter++)});
}, 1000);