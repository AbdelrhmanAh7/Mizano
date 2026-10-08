# AI Questions & Observations (#127)

## Observations & Implementation Decisions

1. **Standalone Worker Process**: Issue #127 mentions configuring Node heap capping for both the `api` and `worker` start scripts. Currently in the repository, background processing (BullMQ / extraction queues) runs embedded inside the `apps/api` NestJS process rather than as an isolated worker service or separate repository package. The launcher helper (`apps/api/scripts/start-node.js`) has been integrated into `apps/api/package.json` (`start:prod`) and can be seamlessly reused for any future dedicated worker entrypoint or Docker command without modification.
2. **Shared Config Schema**: The repository does not currently have a centralized runtime environment configuration schema; environment variables are loaded per application via NestJS `ConfigModule`. We added `nodeHeapMbSchema` to `@mizano/validators` to provide a shared Zod schema and type, while keeping the runtime launcher helper (`node-heap.js`) standalone and dependency-free so that it executes cleanly before any build step.
3. **Environment Template**: There was no `.env.example` in the root repository; `.env.example` has been created, documenting `MIZANO_NODE_HEAP_MB` with a recommended starting value of `1024` for Raspberry Pi 5 deployments.
