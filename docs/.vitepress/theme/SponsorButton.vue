<template>
  <VDropdown>
    <button
      class="htw-inline-flex htw-items-center htw-gap-2 htw-px-4 htw-py-2 htw-btn"
    >
      <span>💚</span>
      <span>Become a sponsor</span>
    </button>

    <template #popper>
      <div class="htw-p-2">
        <a
          href="https://github.com/sponsors/Akryum"
          target="_blank"
          class="htw-p-2 htw-pr-4 htw-flex htw-items-center htw-gap-4 hover:htw-no-underline htw-rounded hover:htw-bg-primary-100 htw-border htw-border-solid htw-border-transparent hover:htw-border-primary-200"
        >
          <img
            src="https://avatars.githubusercontent.com/u/2798204?size=80"
            alt="Akryum avatar"
            class="htw-w-10 htw-h-10 htw-rounded-full"
          >
          Guillaume Chau
        </a>
        <a
          href="https://github.com/sponsors/hugoattal"
          target="_blank"
          class="htw-p-2 htw-pr-4 htw-flex htw-items-center htw-gap-4 hover:htw-no-underline htw-rounded hover:htw-bg-primary-100 htw-border htw-border-solid htw-border-transparent hover:htw-border-primary-200"
        >
          <img
            src="https://avatars.githubusercontent.com/u/4563971?size=80"
            alt="Hugoattal avatar"
            class="htw-w-10 htw-h-10 htw-rounded-full"
          >
          Hugo Attal
        </a>
      </div>
    </template>
  </VDropdown>
</template>
