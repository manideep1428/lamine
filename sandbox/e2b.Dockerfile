# The lamine-web sandbox template.
#
# Everything a child's project can need is baked in here, because the alternative
# is paying for `npm install` on every single build — and because the sandboxes
# run with outbound internet switched off (PLAN.md §9), so an agent could not
# download a library even if it tried.
#
# Build it with:  bun run sandbox:template
# Then set E2B_TEMPLATE=lamine-web in the Convex environment variables.

FROM e2bdev/code-interpreter:latest

# Pinned deliberately. The builder prompts describe Phaser 3 and p5 1.x APIs; a
# floating major version would make agents write code against docs that no longer
# match what is in the sandbox.
ARG PHASER_VERSION=3.90.0
ARG P5_VERSION=1.11.10

# `serve` gives a nicer static server than python3's, and having it local means
# the preview step never needs the network.
RUN npm install -g --no-audit --no-fund serve@14.2.4

# Fetch the browser builds once, vendor them, then throw the install away: the
# agents reference lib/phaser.min.js with a plain <script> tag, so node_modules
# would only be dead weight in every sandbox snapshot.
RUN mkdir -p /tmp/vendor \
    && cd /tmp/vendor \
    && npm init -y > /dev/null \
    && npm install --no-audit --no-fund "phaser@${PHASER_VERSION}" "p5@${P5_VERSION}" \
    && mkdir -p /home/user/project/lib \
    && cp node_modules/phaser/dist/phaser.min.js /home/user/project/lib/phaser.min.js \
    && cp node_modules/p5/lib/p5.min.js /home/user/project/lib/p5.min.js \
    && cd / \
    && rm -rf /tmp/vendor

# The agents' tool calls are all relative to this directory, and
# `lib/core/paths.ts` refuses anything outside it.
RUN mkdir -p /home/user/project/tests /home/user/project/src /home/user/project/styles \
    && chown -R 1000:1000 /home/user/project

WORKDIR /home/user/project
