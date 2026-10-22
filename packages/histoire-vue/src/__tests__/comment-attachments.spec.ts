import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AttachmentStrip from '../../../histoire-app/src/app/components/comments/prompt/AttachmentStrip.vue'
import { commentAttachment } from '../../../histoire/src/node/__tests__/utils/comments.js'

const image = commentAttachment()
const notes = commentAttachment({ path: '.histoire/attachments/00000000-0000-0000-0000-000000000001-notes.txt', name: 'notes.txt', mimeType: 'text/plain', size: 2048 })

describe('attachment strip', () => {
  it('shows images as tiles that open a viewer and files with their type and size', async () => {
    const wrapper = mount(AttachmentStrip, { props: { attachments: [image, notes], removable: true }, global: { stubs: { BuiltinIcon: true } }, attachTo: document.body })
    try {
      expect(wrapper.text()).toContain('notes.txt')
      expect(wrapper.text()).toContain('TXT · 2 KB')
      await wrapper.get('button[aria-label="Open a.png"]').trigger('click')
      const dialog = wrapper.get('dialog')
      expect(dialog.attributes('open')).toBeDefined()
      expect(dialog.get('img').attributes('src')).toContain(image.path.split('/').pop())
      await dialog.get('button[aria-label="Close"]').trigger('click')
      expect(wrapper.find('dialog').exists()).toBe(false)
      await wrapper.get('button[aria-label="Remove notes.txt"]').trigger('click')
      expect(wrapper.emitted('remove')).toEqual([[notes.path]])
    }
    finally { wrapper.unmount() }
  })

  it('shows one placeholder per upload in flight', () => {
    const wrapper = mount(AttachmentStrip, { props: { attachments: [], uploading: 2 }, global: { stubs: { BuiltinIcon: true } } })
    try {
      expect(wrapper.findAll('[aria-label="Uploading"]')).toHaveLength(2)
    }
    finally { wrapper.unmount() }
  })
})
