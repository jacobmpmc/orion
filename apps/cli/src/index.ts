import { greet } from "@orion/core";

console.log(greet(process.argv[2] ?? "world"));
