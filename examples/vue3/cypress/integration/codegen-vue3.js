/// <reference types="cypress" />

describe('Codegen (Vue 3)', () => {
  it('html', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=html')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<h1>Title</h1>
<hr>
<pre>{
  "object": {
    "foo": "bar"
  }
}</pre>
<div data-test-id="object">
  {
    "object": {
      "foo": "bar"
    }
  }
</div>
<button>A button</button>
<button class="btn btn-primary">
   A button 
</button>
<button
  class="btn btn-primary"
  :style="{
    color: 'red',
  }"
>
   A button 
</button>
<input
  type="phone"
  placeholder="Enter your phone number"
>
<ul>
  <li>Single</li>
</ul>
<p>
  <span>Next to it:</span>**** 
</p>
<p>
  <span>Not next to it:</span>
  ****
</p>
<button> Spaces </button>`)
  })

  it('props', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=props')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<input placeholder="Counter...">
<input :value="0">
<input
  :value="0"
  placeholder="Counter..."
>
<input
  :value="{
    foo: 'bar',
  }"
  :items="[1, 2, 3]"
>`)
  })

  it('click-events', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=click-events')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<button @click="onClick">
   Click me 
</button>
<button @click="onClick($event)">
   Click me 
</button>
<button @click="(event) => onClick(event)">
   Click me 
</button>`)
  })

  it('v-model', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=v-model')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<input
  v-model.number="state.count"
  type="number"
>
<input v-model="state.text">
<HstText v-model="state.text" />
<HstText
  v-model.number="state.count"
  type="number"
/>
<HstText
  v-model:foo="state.count"
  v-model:my-prop.number="state.count"
/>`)
  })

  it('custom-directive', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=custom-directive')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<button v-tooltip="'Info'">
  A button
</button>
<button v-tooltip.bottom="'Info'">
  A button
</button>
<button v-tooltip.bottom:foo="'Info'">
  A button
</button>
<button
  v-tooltip="{
    content: 'Info',
    html: true,
  }"
>
  A button
</button>`)
  })

  it('slots', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=slots')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<ModalWithSlots>
  <template #title>
     Title 
  </template>
  <template #footer>
     Footer 
  </template>
   Content 
</ModalWithSlots>`)
  })

  it('slot-with-props', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=slot-with-props')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<SlotWithProps>
  <template #default="{ foo, object, fn }">
    <p :title="{{ foo.toString() }}">
       foo: {{ foo }}
    </p>
    <p :title="object.answer.toString()">
       object.answer: {{ object.answer }}
    </p>
    <p :title="fn(2)">
       fn: {{ fn(2) }}
    </p>
  </template>
</SlotWithProps>`)
  })

  it('slot-with-props-named', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=slot-with-props-named')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<SlotWithProps>
  <template #named="{ foo, object, fn }">
    <p :title="{{ foo.toString() }}">
       foo: {{ foo }}
    </p>
    <p :title="object.answer.toString()">
       object.answer: {{ object.answer }}
    </p>
    <p :title="fn(2)">
       fn: {{ fn(2) }}
    </p>
  </template>
</SlotWithProps>`)
  })

  it('list', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=list')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<ul>
  <li>Foo</li>
  <li>Bar</li>
</ul>`)
  })

  it('function', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=function')
    cy.get('[data-test-id="story-source-code"]').should('have.text', `<div
  :hello="(arg1, arg2, arg3) => 'meow'.repeat(arg3)"
  :get-name="(shade) => \`\${'\\'very-'.repeat(5)}long-\${shade}\`"
/>`)
  })
})
