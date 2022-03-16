<script lang="ts" setup>
interface TeamMember {
  name: string
  avatar: string
  description: string
  github: string
  twitter: string
  sponsor: string
}

const teamMembers: TeamMember[] = [
  {
    name: 'Guillaume Chau',
    avatar: 'https://avatars.githubusercontent.com/u/2798204?size=192',
    description: 'Web & JavaScript enthusiast\nVue.js Core Team',
    github: 'https://github.com/Akryum',
    twitter: 'https://twitter.com/Akryum',
    sponsor: 'https://github.com/sponsors/Akryum',
  },
  {
    name: 'Hugo Attal',
    avatar: 'https://avatars.githubusercontent.com/u/4563971?size=192',
    description: 'French software engineer 🇫🇷',
    github: 'https://github.com/hugoattal',
    twitter: 'https://twitter.com/hugoattal',
    sponsor: 'https://github.com/sponsors/hugoattal',
  },
]
</script>

<template>
  <div class="htw-my-12 htw-flex htw-flex-col htw-items-stretch htw-gap-12">
    <h2 class="htw-text-center htw-text-3xl">
      Meet the team
    </h2>

    <div class="htw-grid htw-gap-4 md:htw-grid-cols-2 htw-w-full htw-max-w-[500px] htw-mx-auto">
      <div
        v-for="(tm, index) of teamMembers"
        :key="index"
        class="htw-flex htw-flex-col htw-items-center htw-gap-2 htw-text-center"
      >
        <img
          :src="tm.avatar"
          alt="Avatar"
          class="htw-rounded-full htw-w-24 htw-h-24 htw-border htw-border-solid htw-border-gray-200"
        >

        <div class="htw-flex-1">
          <div class="htw-text-xl">
            {{ tm.name }}
          </div>

          <div
            class="htw-text-gray-500 htw-whitespace-pre"
            v-text="tm.description"
          />
        </div>

        <div class="htw-flex htw-gap-2">
          <a
            :href="tm.github"
            target="_blank"
            class="htw-text-gray-500 hover:htw-text-primary-500"
          >
            <Icon
              icon="mdi:github"
              class="htw-w-6 htw-h-6"
            />
          </a>
          <a
            :href="tm.twitter"
            target="_blank"
            class="htw-text-gray-500 hover:htw-text-primary-500"
          >
            <Icon
              icon="mdi:twitter"
              class="htw-w-6 htw-h-6"
            />
          </a>
        </div>

        <a
          :href="tm.sponsor"
          target="_blank"
          class="htw-inline-flex htw-items-center htw-gap-2 htw-px-4 htw-py-2 hover:htw-no-underline htw-btn"
        >
          <span>💚</span>
          <span>Sponsor</span>
        </a>
      </div>
    </div>
  </div>
</template>
