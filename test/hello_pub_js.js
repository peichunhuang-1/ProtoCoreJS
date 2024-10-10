import {NodeHandler} from '../src/NodeHandler.js';

const nh = new NodeHandler('publisher', 'js');
nh.publisher_handler.add_publisher("hello", "type.googleapis.com/std_msgs.String");
var counter = 1;
const intervalId = setInterval(() => {
    nh.publisher_handler.publish("hello", {data: String(counter++)});
}, 1000);
const handler = {
    handle: (data, decoder) => {
        console.log(decoder.decode(data));
    }
};
// await new Promise(r => setTimeout(r, 2000));
nh.subscriber_handler.add_subscriber('hello', handler);

const intervalId2 = setInterval(() => {
    const matrix = nh.transforms_handler.lookupTransform("root", "frame_static2", null, -1);
    if (matrix) {
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(matrix);

        const quaternion = new THREE.Quaternion();
        quaternion.setFromRotationMatrix(matrix);

        console.log(`Translation: x=${position.x}, y=${position.y}, z=${position.z}`);
        console.log(`Rotation: x=${quaternion.x}, y=${quaternion.y}, z=${quaternion.z}, w=${quaternion.w}`);
    }
}, 1000);