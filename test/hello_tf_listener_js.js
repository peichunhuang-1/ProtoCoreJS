import {NodeHandler} from '../src/NodeHandler.js';
import * as THREE from 'three';

const nh = new NodeHandler('tf_listener', 'js');

const intervalId = setInterval(() => {
    const matrix = nh.transforms_handler.lookupTransform("frame_static3", "frame_static2", null, -1);
    if (matrix) {
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(matrix);

        const quaternion = new THREE.Quaternion();
        quaternion.setFromRotationMatrix(matrix);

        console.log(`Translation: x=${position.x}, y=${position.y}, z=${position.z}`);
        console.log(`Rotation: x=${quaternion.x}, y=${quaternion.y}, z=${quaternion.z}, w=${quaternion.w}`);
    }
}, 1000);