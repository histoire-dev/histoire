import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMyStore = defineStore('myStore', () => {
  const myValue = ref(10)

  return {
    myValue,
  }
})
