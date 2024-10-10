import {NodeHandler} from '../src/NodeHandler.js';

const nh = new NodeHandler('subscriber', 'js');
const handler = {
    handle: (data, decoder) => {
        console.log(decoder.decode(data));
    }
};
nh.subscriber_handler.add_subscriber('hello', handler);
