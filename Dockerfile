# syntax=docker/dockerfile:1

FROM denoland/deno:2.7.14

ARG GIT_REVISION=dev
ENV DENO_DEPLOYMENT_ID=${GIT_REVISION}
ENV DENO_NO_PROMPT=1
ENV DENO_NO_UPDATE_CHECK=1

WORKDIR /app

# Copy dependency manifests first for better layer caching.
COPY deno.json deno.lock ./

# Fresh requires this so npm dependencies are materialized and postinstall scripts run.
RUN deno install --allow-scripts

# Copy app source and build the production server bundle.
COPY . .
RUN deno task build

# Run the server for a couple of seconds to ensure all caches are populated, and then stop it.
RUN deno serve -A _fresh/server.js & sleep 5 && kill $!

EXPOSE 8000

CMD ["deno", "serve", "-A", "_fresh/server.js"]
