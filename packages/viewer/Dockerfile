# Self-contained viewer image. Build from the repository root:
#   docker build -f packages/viewer/Dockerfile -t orion-viewer .
#
# Storage and viewer plugins are ordinary npm packages, so an image that needs
# them installs them on top of this one and mounts a configuration file.

FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY plugins ./plugins

RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm deploy --filter @orion/viewer --prod /out


FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /out ./

# Reports are read-only from here, so the process needs no write access.
USER node
EXPOSE 7317

# 0.0.0.0 rather than the default loopback: a container that binds loopback is
# unreachable from its host.
ENTRYPOINT ["node", "./dist/bin.js"]
CMD ["--host", "0.0.0.0", "--port", "7317"]
