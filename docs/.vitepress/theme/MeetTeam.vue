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
  <div class="my-12 flex flex-col items-stretch gap-12">
    <div class="grid gap-4 md:grid-cols-2 w-full max-w-[500px] mx-auto">
      <div
        v-for="(tm, index) of teamMembers"
        :key="index"
        class="flex flex-col items-center gap-2 text-center"
      >
        <img
          :src="tm.avatar"
          alt="Avatar"
          class="rounded-full w-24 h-24 border border-solid border-gray-200"
        >

        <div class="flex-1">
          <div class="text-xl">
            {{ tm.name }}
          </div>

          <div
            class="text-gray-500 whitespace-pre"
            v-text="tm.description"
          />
        </div>

        <div class="flex gap-2">
          <a
            :href="tm.github"
            target="_blank"
            class="text-gray-500 hover:text-primary-500"
          >
            <Icon
              icon="mdi:github"
              class="w-6 h-6"
            />
          </a>
          <a
            :href="tm.twitter"
            target="_blank"
            class="text-gray-500 hover:text-primary-500"
          >
            <Icon
              icon="mdi:twitter"
              class="w-6 h-6"
            />
          </a>
        </div>

        <a
          :href="tm.sponsor"
          target="_blank"
          class="inline-flex items-center gap-2 px-4 py-2 hover:no-underline btn"
        >
          <span>💚</span>
          <span>Sponsor</span>
        </a>
      </div>
    </div>
  </div>
</template>
