<script setup lang="ts">
import { base } from "../api.js";
</script>

<template>
  <section>
    <h2>Nothing here</h2>
    <p>A report link looks like <code>{{ base }}r/&lt;connection&gt;/&lt;id&gt;</code>.</p>
    <p><a :href="base">Back to the start</a></p>
  </section>
</template>
