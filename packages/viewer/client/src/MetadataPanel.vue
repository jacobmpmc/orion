<script setup lang="ts">
import { computed } from "vue";
import {
  ciMetadata,
  customMetadata,
  gitMetadata,
  metadataCollectedAt,
} from "@orion/core";
import type { Report } from "@orion/core";

/*
 * Provenance is chrome, not content: it is the same for every report kind, so
 * the host draws it rather than each viewer plugin drawing its own version.
 * Plugins can still read the same values through the core helpers when the
 * context belongs inside their own rendering.
 *
 * Everything here goes through those helpers rather than reading
 * `report.metadata` directly -- a dropped file is whatever JSON the user had.
 */
const props = defineProps<{ report: Report }>();

const git = computed(() => gitMetadata(props.report));
const ci = computed(() => ciMetadata(props.report));
const custom = computed(() => customMetadata(props.report));
const collectedAt = computed(() => metadataCollectedAt(props.report));

/** A commit is recognised by its first characters; the rest is noise. */
const shortCommit = computed(() => git.value?.commit?.slice(0, 7));

/** Enough to know which report this is without expanding the panel. */
const summary = computed(() => {
  const parts: string[] = [];
  if (git.value?.branch !== undefined) parts.push(git.value.branch);
  if (git.value?.tag !== undefined) parts.push(git.value.tag);
  if (shortCommit.value !== undefined) parts.push(shortCommit.value);
  if (ci.value?.pullRequest !== undefined) parts.push(`PR #${ci.value.pullRequest}`);
  return parts.length > 0 ? parts.join(" · ") : "Report details";
});

function when(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/**
 * Only http(s) values are ever turned into a link.
 *
 * A dropped report is untrusted input, and a `javascript:` URL in it would
 * otherwise become a clickable link inside the page.
 */
function isHttpUrl(value: string | undefined): value is string {
  if (value === undefined) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
</script>

<template>
  <!-- Native <details>: collapsed by default, keyboard-accessible, no state to
       manage, and never competing with the plugin's own rendering below it. -->
  <details class="metadata">
    <summary>{{ summary }}</summary>

    <dl>
      <dt>Generated</dt>
      <dd :title="report.generatedAt">{{ when(report.generatedAt) }}</dd>

      <template v-if="git">
        <dt>Commit</dt>
        <dd>
          <code :title="git.commit">{{ shortCommit }}</code>
          <span v-if="git.subject">{{ git.subject }}</span>
          <span v-if="git.dirty" class="dirty">uncommitted changes</span>
        </dd>

        <template v-if="git.branch">
          <dt>Branch</dt>
          <dd>{{ git.branch }}</dd>
        </template>

        <template v-if="git.tag">
          <dt>Tag</dt>
          <dd>{{ git.tag }}</dd>
        </template>

        <template v-if="git.author || git.committedAt">
          <dt>Committed</dt>
          <dd :title="git.committedAt">
            <span v-if="git.author">{{ git.author }}</span>
            <span v-if="git.committedAt">{{ when(git.committedAt) }}</span>
          </dd>
        </template>

        <template v-if="git.remotes">
          <dt>Remotes</dt>
          <dd>
            <div v-for="remote in git.remotes" :key="remote.name">
              {{ remote.name }}
              <a v-if="isHttpUrl(remote.url)" :href="remote.url">{{ remote.url }}</a>
              <span v-else>{{ remote.url }}</span>
            </div>
          </dd>
        </template>
      </template>

      <template v-if="ci">
        <dt>CI</dt>
        <dd>
          <span>{{ ci.provider }}</span>
          <span v-if="ci.repository">{{ ci.repository }}</span>
          <span v-if="ci.workflow">{{ ci.workflow }}</span>
          <span v-if="ci.job">{{ ci.job }}</span>
          <span v-if="ci.eventName">{{ ci.eventName }}</span>
          <span v-if="ci.actor">{{ ci.actor }}</span>
        </dd>

        <template v-if="ci.runId || ci.runUrl">
          <dt>Run</dt>
          <dd>
            <a v-if="isHttpUrl(ci.runUrl)" :href="ci.runUrl">{{ ci.runId ?? ci.runUrl }}</a>
            <span v-else>{{ ci.runId }}</span>
            <span v-if="ci.runAttempt && ci.runAttempt !== '1'">attempt {{ ci.runAttempt }}</span>
          </dd>
        </template>

        <template v-if="ci.pullRequest">
          <dt>Pull request</dt>
          <dd>
            <a v-if="isHttpUrl(ci.pullRequestUrl)" :href="ci.pullRequestUrl">
              #{{ ci.pullRequest }}
            </a>
            <span v-else>#{{ ci.pullRequest }}</span>
          </dd>
        </template>
      </template>

      <template v-for="entry in custom" :key="entry.key">
        <dt>{{ entry.key }}</dt>
        <dd>{{ entry.value }}</dd>
      </template>
    </dl>

    <p v-if="collectedAt === undefined" class="hint">
      This report carries no metadata; it was generated before orion collected any, or with
      <code>--no-metadata</code>.
    </p>
  </details>
</template>

<style scoped>
.metadata {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
}

summary {
  cursor: pointer;
  color: var(--muted);
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0.75rem 0 0;
}

dt {
  color: var(--muted);
}

dd {
  margin: 0;
  /* Remote URLs and commit subjects are long and must not widen the page. */
  overflow-wrap: anywhere;
}

dd :nth-child(n+2)::before {
  content: " · ";
  color: var(--muted);
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 0.1em 0.3em;
}

.dirty {
  color: var(--warn);
}

.hint {
  color: var(--muted);
  margin: 0.75rem 0 0;
}
</style>
