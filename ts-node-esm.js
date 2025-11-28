#!/usr/bin/env node
import { register } from "ts-node";
import { pathToFileURL } from "node:url";

register({
  transpileOnly: true,
  compilerOptions: {
    module: "NodeNext",
    target: "ES2022"
  }
});

import(pathToFileURL("./server/index.ts").href);