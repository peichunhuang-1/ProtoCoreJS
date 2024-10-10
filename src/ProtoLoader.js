import protobuf from 'protobufjs';
import fs from 'fs';
import path from 'path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

export function loadProtosFromDirs(directories) {
    const root = new protobuf.Root();
    directories.forEach(directory => {
        const protoFiles = findProtoFiles(directory);
        protoFiles.forEach(protoFile => {
            protobuf.loadSync(protoFile, root);
        });
    });

    return root;
}

export function loadGrpcDefine(path) {
    const packageDefinition = protoLoader.loadSync(
        path,
        {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        }
    );
    return grpc.loadPackageDefinition(packageDefinition);
}

function findProtoFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);

    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);

        if (stat && stat.isDirectory()) {
            results = results.concat(findProtoFiles(file));
        } else if (file.endsWith('.proto')) {
            results.push(file);
        }
    });

    return results;
}