import * as THREE from 'three';
import SortedArray from 'sorted-array';

class TransformTreeNode {
    constructor(frame_id, transform_stamped, is_static) {
        this.parent = null;
        this.frame_id = frame_id;
        this.transform = new SortedArray([], (r, l) =>  l.timestamp - r.timestamp);
        if (transform_stamped) {
            this.transform.insert(transform_stamped);
        }
        this.static = is_static;
    }
    setParent(parent) {
        this.parent = parent;
    }
    pushTransform(transform_stamped) {
        this.transform.insert(transform_stamped);
    }
    getTransform(timestamp, timeout) {
        if (timeout < 0 || this.static) {
            if (this.transform.length === 0) return null;
            return this.transform.array.at(this.transform.length - 1);
        } else {
            const index = this.transform.sortedIndex({timestamp: timestamp});
            if (index === 0) {
                if (timeout > Math.abs(this.transform.array.at(0).timestamp - timestamp)) {
                    return this.transform.array.at(0);
                } else {
                    return null;
                }
            } else if (index === this.transform.size()) {
                if (timeout > Math.abs(this.transform.array.at(this.transform.size() - 1).timestamp - timestamp)) {
                    return this.transform.array.at(this.transform.size() - 1);
                } else {
                    return null;
                }
            } else {
                const lower = this.transform.array.at(index - 1);
                const upper = this.transform.array.at(index);
                const lower_time = Math.abs(lower.timestamp - timestamp);
                const upper_time = Math.abs(upper.timestamp - timestamp)
                if (upper_time > lower_time) {
                    if (timeout > lower_time) return lower;
                    else return null;
                } else {
                    if (timeout > upper_time) return upper;
                    else return null;
                }
            }
        }
    }
};

class TransformTree {
    constructor() {
        this.tree = new Map();
        this.ancestors = new Map();
    }
    addTreeNode(frame_id, transform, parent_frame_id, is_static) {
        if (!this.tree.has(parent_frame_id)) {
            this.tree.set(parent_frame_id, new TransformTreeNode(parent_frame_id, null, is_static));
        }
        if (!this.tree.has(frame_id)) {
            this.tree.set(frame_id, new TransformTreeNode(frame_id, transform, is_static));
            this.tree.get(frame_id).setParent(this.tree.get(parent_frame_id));
        } else {
            if (!this.tree.get(frame_id).parent) {
                this.tree.get(frame_id).setParent(this.tree.get(parent_frame_id));
            }
            this.tree.get(frame_id).pushTransform(transform);
        }
    }
    lookupTransform(from_frame, to_frame, timestamp, timeout) {
        if (!this.findSharedAncestor(from_frame, to_frame)) {
            return null;
        }
        const token = from_frame > to_frame? from_frame + ":" + to_frame: to_frame + ":" + from_frame;
        const ancestor_id = this.ancestors.get(token);
        const matrix = new THREE.Matrix4();

        var iter = this.tree.get(from_frame);
        while (iter.frame_id != ancestor_id) {
            const transform = iter.getTransform(timestamp, timeout);
            if (!transform) {
                console.log(`failed to get transform ${iter.frame_id}`);
                return null;
            }
            matrix.multiplyMatrices(transform.matrix, matrix);
            iter = iter.parent;
        }
        matrix.invert();
        var iter = this.tree.get(to_frame);
        while (iter.frame_id != ancestor_id) {
            const transform = iter.getTransform(timestamp, timeout);
            if (!transform) {
                console.log(`failed to get transform ${iter.frame_id}`);
                return null;
            }
            matrix.multiplyMatrices(transform.matrix, matrix);
            iter = iter.parent;
        }
        return matrix;
    }
    findSharedAncestor(from_frame, to_frame) {
        if (!this.tree.has(from_frame) || !this.tree.has(to_frame)) {
            console.log(`${from_frame} or ${to_frame} not in tf tree`);
            return null;
        }
        const token = from_frame > to_frame? from_frame + ":" + to_frame: to_frame + ":" + from_frame;
        if (this.ancestors.has(token)) {
            return true;
        }
        const from_path = new Set();
        var iter = this.tree.get(from_frame);
        while (iter) {
            if (from_path.has(iter.frame_id)) {
                console.log("close loop in tf tree, not a valid tree");
            }
            from_path.add(iter.frame_id);
            iter = iter.parent;
        }
        const to_path = new Set();
        iter = this.tree.get(to_frame);
        while (iter) {
            if (to_path.has(iter.frame_id)) {
                console.log("close loop in tf tree, not a valid tree");
            }
            if (from_path.has(iter.frame_id)) {
                this.ancestors.set(token, iter.frame_id);
                return true;
            }
            to_path.add(iter.frame_id);
            iter = iter.parent;
        }
        console.log(`${from_frame} and ${to_frame} has no shared ancestor`);
        return false;
    }
};

export class TransformHandler {
    constructor(root, listener) {
        this.root = root;
        this.listener = listener;
        this.tf_tree = new TransformTree();
        const tf_handler = {
            handle: (data, decoder)=>{
                const message = decoder.decode(data);
                if (message.header.frameId && message.childFrameId) {
                    const timestamp = message.header.timestamp? message.header.timestamp.seconds * 1e3 + message.header.timestamp.nanos / 1e3 : 0;
                    const transform = {
                        timestamp: timestamp,
                        matrix: this.toTransformMatrix(message)
                    };
                    this.tf_tree.addTreeNode(message.childFrameId, transform, message.header.frameId, false);
                }
            }
        };
        const tf_static_handler = {
            handle: (data, decoder)=>{
                const message = decoder.decode(data);
                if (message.header.frameId && message.childFrameId) {
                    const timestamp = message.header.timestamp? message.header.timestamp.seconds * 1e3 + message.header.timestamp.nanos / 1e3 : 0;
                    const transform = {
                        timestamp: timestamp,
                        matrix: this.toTransformMatrix(message)
                    };
                    this.tf_tree.addTreeNode(message.childFrameId, transform, message.header.frameId, true);
                }
            }
        };
        this.listener.add_subscriber('/tf', tf_handler);
        this.listener.add_subscriber('/tf_static', tf_static_handler);
    }
    lookupTransform(from_frame, to_frame, timestamp, timeout) {
        return this.tf_tree.lookupTransform(from_frame, to_frame, timestamp, timeout);
    }
    toTransformMatrix(message) {
        const quaternion = new THREE.Quaternion(
            message.rotation.x ? message.rotation.x : 0, 
            message.rotation.y ? message.rotation.y : 0, 
            message.rotation.z ? message.rotation.z : 0, 
            message.rotation.w ? message.rotation.w : 0
        );
    
        const position = new THREE.Vector3(
            message.transition.x ? message.transition.x : 0, 
            message.transition.y ? message.transition.y : 0, 
            message.transition.z ? message.transition.z : 0
        );
    
        const scale = new THREE.Vector3(1, 1, 1);
    
        const matrix = new THREE.Matrix4();
        matrix.compose(position, quaternion, scale);

        return matrix;
    }
};