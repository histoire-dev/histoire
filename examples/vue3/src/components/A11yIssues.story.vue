<script setup lang="ts">
// Tiny inline image so the missing-alt variant needs no network request.
const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%2334d399"/%3E%3C/svg%3E'
</script>

<!-- Each variant breaks one group of axe-core rules on purpose, to exercise the a11y plugin. -->
<template>
  <Story title="Accessibility issues">
    <Variant title="Clean">
      <form class="a11y-form">
        <label for="clean-email">Email</label>
        <input id="clean-email" type="email">
        <button type="submit">
          Subscribe
        </button>
      </form>
    </Variant>

    <Variant title="Missing alt text">
      <img :src="image" width="64" height="64">
      <input type="image" :src="image">
    </Variant>

    <Variant title="Unlabeled controls">
      <button type="button">
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" /></svg>
      </button>
      <input type="text" placeholder="Search">
      <select>
        <option>One</option>
      </select>
    </Variant>

    <Variant title="Empty links">
      <a href="#docs" />
      <a href="#more"><span aria-hidden="true">→</span></a>
    </Variant>

    <Variant title="Low contrast">
      <p class="a11y-low-contrast">
        This text barely stands out from its background.
      </p>
    </Variant>

    <Variant title="Invalid ARIA">
      <div role="buton" tabindex="0">
        Fake button
      </div>
      <div aria-hidden="true">
        <button type="button">
          Hidden but focusable
        </button>
      </div>
      <span aria-checked="maybe" role="checkbox" tabindex="0">Opt in</span>
    </Variant>

    <Variant title="Broken structure">
      <ul>
        <div>Not a list item</div>
      </ul>
      <h1>Title</h1>
      <h4>Skipped heading levels</h4>
      <div id="duplicate" tabindex="3">
        Positive tabindex
      </div>
      <label for="duplicate">Points to a non-form element</label>
    </Variant>
  </Story>
</template>

<style scoped>
.a11y-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.a11y-low-contrast {
  color: #b8b8b8;
  background: #ffffff;
  padding: 8px;
}
</style>
