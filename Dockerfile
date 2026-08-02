# syntax=docker/dockerfile:1

FROM denoland/deno:2.8.3

ARG GIT_REVISION=dev
ENV DENO_DEPLOYMENT_ID=${GIT_REVISION}
ENV DENO_NO_PROMPT=1
ENV DENO_NO_UPDATE_CHECK=1

WORKDIR /app

# Copy dependency manifests first for better layer caching.
COPY package.json deno.lock ./

# Materialize npm + JSR dependencies (and run postinstall scripts).
RUN deno install --allow-scripts

# Copy app source and build the production server bundle (Vite + Nitro).
ENV NITRO_PRESET=deno-server
COPY . .
RUN deno task build

ENV PORT=8000
EXPOSE 8000

CMD ["deno", "run", "-A", ".output/server/index.mjs"]
