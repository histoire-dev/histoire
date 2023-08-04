<script lang="ts" setup>
defineProps({
    bgcolorselect: {
        type: String,
        default: null,
    },
    txtcolorselect: {
        type: String,
        default: null,
    },
})
</script>

<template>
    <button :style="{ background: bgcolorselect, color: txtcolorselect }" class="htw-px-2 htw-py-1 htw-rounded-sm btn">
        <slot />
    </button>
</template>

<style scoped>
.btn {
    cursor: pointer;
}
</style>